import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, diagramLocks, diagrams, shareLinks } from '../src/db/schema.js';
import { onLinkChanged } from '../src/events.js';
import {
    as,
    createTestApp,
    registerUser,
    sampleContent,
    type TestCtx,
    type TestUser,
} from './helpers.js';

interface Item {
    id: string;
    title: string;
    projectId: string;
    projectName: string | null;
    projectSlug: string | null;
    ownerId: string;
    ownerEmail: string | null;
    updatedAt: string;
    publishedVersion: number | null;
    editingBy: { userId: string; email: string | null } | null;
    activeLinks: number;
}

interface LinkItem {
    id: string;
    access: string;
    live: boolean;
    expiresAt: string | null;
    createdAt: string;
    revokedAt: string | null;
    createdById: string | null;
    createdByEmail: string | null;
    status: string;
}

describe('admin diagrams and their share links', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let anna: TestUser;
    let cara: TestUser;
    let billing: { id: string; slug: string };
    let orders: { id: string; slug: string };
    let invoices: string;
    let orderForm: string;
    let draft: string;

    const call = (
        who: TestUser | null,
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        url: string,
        payload?: object
    ) => ctx.app.inject({ method, url, headers: who ? as(who) : {}, payload });

    const list = async (query = '') => {
        const res = await call(admin, 'GET', `/admin/diagrams${query}`);
        expect(res.statusCode).toBe(200);
        return res.json() as { items: Item[]; total: number; page: number; limit: number };
    };

    const links = async (id: string) => {
        const res = await call(admin, 'GET', `/admin/diagrams/${id}/share-links`);
        expect(res.statusCode).toBe(200);
        return res.json() as LinkItem[];
    };

    const makeProject = async (name: string) =>
        (await call(admin, 'POST', '/admin/projects', { name })).json() as {
            id: string;
            slug: string;
        };

    const join = (project: { id: string }, who: TestUser) =>
        call(admin, 'PUT', `/admin/projects/${project.id}/members/${who.id}`, {
            role: 'editor',
        });

    const create = async (who: TestUser, project: { id: string }, title: string) => {
        const res = await call(who, 'POST', '/diagrams', {
            title,
            content: sampleContent,
            projectId: project.id,
        });
        expect(res.statusCode).toBe(201);
        return res.json().id as string;
    };

    const share = async (who: TestUser, id: string, body: object = {}) => {
        const res = await call(who, 'POST', `/diagrams/${id}/share-links`, body);
        expect(res.statusCode).toBe(201);
        return res.json() as { id: string; token: string };
    };

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
        anna = await registerUser(ctx.app, 'anna@example.com');
        cara = await registerUser(ctx.app, 'cara@example.com');
        billing = await makeProject('Billing');
        orders = await makeProject('Orders');
        await join(billing, anna);
        await join(orders, cara);

        invoices = await create(anna, billing, 'Invoices');
        orderForm = await create(cara, orders, 'Order form');
        draft = await create(anna, billing, 'Draft');

        // Invoices: published twice, and four links in four states
        await call(anna, 'POST', `/diagrams/${invoices}/publish`, {});
        await call(anna, 'POST', `/diagrams/${invoices}/publish`, {});
        await share(anna, invoices); // active
        const toRevoke = await share(anna, invoices);
        await call(anna, 'DELETE', `/diagrams/${invoices}/share-links/${toRevoke.id}`);
        const toExpire = await share(anna, invoices);
        await ctx.db
            .update(shareLinks)
            .set({ expiresAt: new Date(Date.now() - 60_000) })
            .where(eq(shareLinks.id, toExpire.id));
        const toSwitchOff = await share(anna, invoices);
        await call(anna, 'PATCH', `/diagrams/${invoices}/share-links/${toSwitchOff.id}`, {
            access: 'off',
        });

        // Order form: published once and being edited by cara
        await call(cara, 'POST', `/diagrams/${orderForm}/publish`, {});
        await call(cara, 'POST', `/diagrams/${orderForm}/lock`, { editorId: 'tab-1' });

        // Draft: never published; its lock was never renewed
        await call(anna, 'POST', `/diagrams/${draft}/lock`, { editorId: 'tab-2' });
        await ctx.db
            .update(diagramLocks)
            .set({ expiresAt: new Date(Date.now() - 60_000) })
            .where(eq(diagramLocks.diagramId, draft));

        // a known, distinct order: newest change first
        const set = (id: string, minutesAgo: number) =>
            ctx.db
                .update(diagrams)
                .set({ updatedAt: new Date(Date.now() - minutesAgo * 60_000) })
                .where(eq(diagrams.id, id));
        await set(orderForm, 1);
        await set(invoices, 2);
        await set(draft, 3);
    });
    afterAll(() => ctx.close());

    describe('GET /admin/diagrams', () => {
        it('is for admins only', async () => {
            expect((await call(null, 'GET', '/admin/diagrams')).statusCode).toBe(401);
            // even someone who owns diagrams
            expect((await call(anna, 'GET', '/admin/diagrams')).statusCode).toBe(404);
        });

        it('lists every diagram, most recently changed first', async () => {
            const { items, total } = await list();
            expect(total).toBe(3);
            expect(items.map((d) => d.title)).toEqual(['Order form', 'Invoices', 'Draft']);
        });

        it('says where each lives and who owns it', async () => {
            const byTitle = Object.fromEntries((await list()).items.map((d) => [d.title, d]));
            expect(byTitle.Invoices).toMatchObject({
                id: invoices,
                projectId: billing.id,
                projectName: 'Billing',
                projectSlug: billing.slug,
                ownerId: anna.id,
                ownerEmail: 'anna@example.com',
            });
            expect(byTitle['Order form']).toMatchObject({
                projectName: 'Orders',
                ownerEmail: 'cara@example.com',
            });
        });

        it('shows the newest published version, or none', async () => {
            const byTitle = Object.fromEntries((await list()).items.map((d) => [d.title, d]));
            expect(byTitle.Invoices.publishedVersion).toBe(2);
            expect(byTitle['Order form'].publishedVersion).toBe(1);
            expect(byTitle.Draft.publishedVersion).toBeNull();
            await call(anna, 'POST', `/diagrams/${invoices}/publish`, {});
            const again = Object.fromEntries((await list()).items.map((d) => [d.title, d]));
            expect(again.Invoices.publishedVersion).toBe(3);
        });

        it('shows who is editing now, and ignores a lease nobody renewed', async () => {
            const byTitle = Object.fromEntries((await list()).items.map((d) => [d.title, d]));
            expect(byTitle['Order form'].editingBy).toEqual({
                userId: cara.id,
                email: 'cara@example.com',
            });
            // Draft has a lock row, but it ran out
            expect(byTitle.Draft.editingBy).toBeNull();
            expect(byTitle.Invoices.editingBy).toBeNull();
            // and it clears when they leave
            await call(cara, 'DELETE', `/diagrams/${orderForm}/lock?editorId=tab-1`);
            expect((await list()).items.find((d) => d.id === orderForm)!.editingBy).toBeNull();
            await call(cara, 'POST', `/diagrams/${orderForm}/lock`, { editorId: 'tab-1' });
        });

        it('counts only the share links that can be opened', async () => {
            const byTitle = Object.fromEntries((await list()).items.map((d) => [d.title, d]));
            // of four: one active, one revoked, one expired, one switched off
            expect(byTitle.Invoices.activeLinks).toBe(1);
            expect(byTitle['Order form'].activeLinks).toBe(0);
        });

        it('reads only what it shows: no content, no token', async () => {
            const res = await call(admin, 'GET', '/admin/diagrams');
            const [first] = res.json().items;
            expect(Object.keys(first).sort()).toEqual(
                [
                    'activeLinks',
                    'editingBy',
                    'id',
                    'ownerEmail',
                    'ownerId',
                    'projectId',
                    'projectName',
                    'projectSlug',
                    'publishedVersion',
                    'title',
                    'updatedAt',
                ].sort()
            );
            expect(res.body).not.toContain('tables');
            expect(res.body).not.toMatch(/token/i);
        });

        describe('search and filter', () => {
            it('finds a title by any part of it, ignoring case', async () => {
                expect((await list('?q=INVO')).items.map((d) => d.title)).toEqual(['Invoices']);
                expect((await list('?q=form')).items.map((d) => d.title)).toEqual(['Order form']);
                const none = await list('?q=nothing');
                expect(none.items).toEqual([]);
                expect(none.total).toBe(0);
            });

            it('takes % and _ in a search as the characters they are', async () => {
                const a = await create(anna, billing, '50% done');
                const b = await create(anna, billing, '500 done');
                const c = await create(anna, billing, 'snake_case');
                const d = await create(anna, billing, 'snakeXcase');
                expect((await list('?q=50%25')).items.map((x) => x.id)).toEqual([a]);
                expect((await list('?q=snake_')).items.map((x) => x.id)).toEqual([c]);
                await ctx.db
                    .delete(diagrams)
                    .where(inArray(diagrams.id, [a, b, c, d]));
            });

            it('narrows to one project', async () => {
                const inBilling = await list(`?projectId=${billing.id}`);
                expect(inBilling.total).toBe(2);
                expect(inBilling.items.every((d) => d.projectId === billing.id)).toBe(true);
                expect((await list(`?projectId=${orders.id}`)).items.map((d) => d.title)).toEqual([
                    'Order form',
                ]);
            });

            it('combines a project and a search', async () => {
                expect(
                    (await list(`?projectId=${billing.id}&q=draft`)).items.map((d) => d.title)
                ).toEqual(['Draft']);
                expect((await list(`?projectId=${orders.id}&q=draft`)).items).toEqual([]);
            });
        });

        describe('paging', () => {
            it('pages, with the total of the whole list', async () => {
                const first = await list('?limit=2&page=1');
                const second = await list('?limit=2&page=2');
                expect(first.total).toBe(3);
                expect(first.items.map((d) => d.title)).toEqual(['Order form', 'Invoices']);
                expect(second.items.map((d) => d.title)).toEqual(['Draft']);
                expect(second.page).toBe(2);
                expect((await list('?limit=2&page=3')).items).toEqual([]);
            });

            it('keeps a stable order when many were changed at the same moment', async () => {
                const same = new Date('2030-01-01T00:00:00Z');
                const ids = [] as string[];
                for (let i = 0; i < 5; i++) {
                    ids.push(await create(anna, billing, `Same ${i}`));
                }
                await ctx.db
                    .update(diagrams)
                    .set({ updatedAt: same })
                    .where(inArray(diagrams.id, ids));

                const seen: string[] = [];
                for (let page = 1; page <= 3; page++) {
                    seen.push(
                        ...(await list(`?q=Same&limit=2&page=${page}`)).items.map((d) => d.id)
                    );
                }
                expect(new Set(seen).size).toBe(5);
                expect(seen).toHaveLength(5);
                await ctx.db.delete(diagrams).where(inArray(diagrams.id, ids));
            });

            it('takes a hundred rows at most', async () => {
                expect((await call(admin, 'GET', '/admin/diagrams?limit=100')).statusCode).toBe(200);
                expect((await call(admin, 'GET', '/admin/diagrams?limit=101')).statusCode).toBe(400);
                expect((await call(admin, 'GET', '/admin/diagrams?limit=0')).statusCode).toBe(400);
            });

            it('refuses a project that is not an id', async () => {
                expect((await call(admin, 'GET', '/admin/diagrams?projectId=nope')).statusCode).toBe(
                    400
                );
            });
        });
    });

    describe('GET /admin/diagrams/:id/share-links', () => {
        it('lists every link newest first with its state, and never the address', async () => {
            const all = await links(invoices);
            expect(all).toHaveLength(4);
            expect(all.map((l) => l.status).sort()).toEqual([
                'active',
                'expired',
                'off',
                'revoked',
            ]);
            const times = all.map((l) => Date.parse(l.createdAt));
            expect([...times].sort((a, b) => b - a)).toEqual(times);
            for (const l of all) {
                expect(Object.keys(l).sort()).toEqual(
                    [
                        'access',
                        'createdAt',
                        'createdByEmail',
                        'createdById',
                        'expiresAt',
                        'id',
                        'live',
                        'revokedAt',
                        'status',
                    ].sort()
                );
                expect(l.createdByEmail).toBe('anna@example.com');
            }
            const res = await call(admin, 'GET', `/admin/diagrams/${invoices}/share-links`);
            expect(res.body).not.toMatch(/token/i);
        });

        it('is an empty list for a diagram that was never shared', async () => {
            expect(await links(draft)).toEqual([]);
        });

        it('keeps a link whose maker has been deleted, without a name', async () => {
            const dave = await registerUser(ctx.app, 'dave@example.com');
            await join(billing, dave);
            const id = await create(dave, billing, 'Dave diagram');
            await share(dave, id);
            await call(admin, 'DELETE', `/admin/users/${dave.id}`);
            const [only] = await links(id);
            expect(only.createdById).toBeNull();
            expect(only.createdByEmail).toBeNull();
            expect(only.status).toBe('active');
        });

        it('is for admins only, and for diagrams that exist', async () => {
            expect(
                (await call(null, 'GET', `/admin/diagrams/${invoices}/share-links`)).statusCode
            ).toBe(401);
            expect(
                (await call(anna, 'GET', `/admin/diagrams/${invoices}/share-links`)).statusCode
            ).toBe(404);
            expect(
                (
                    await call(
                        admin,
                        'GET',
                        '/admin/diagrams/00000000-0000-4000-8000-000000000000/share-links'
                    )
                ).statusCode
            ).toBe(404);
            expect((await call(admin, 'GET', '/admin/diagrams/nope/share-links')).statusCode).toBe(
                400
            );
        });
    });

    describe('DELETE /admin/diagrams/:id/share-links/:linkId', () => {
        const rows = (linkId: string) =>
            ctx.db
                .select()
                .from(auditLog)
                .where(and(eq(auditLog.action, 'share.revoke'), eq(auditLog.diagramId, orderForm)))
                .then((all) => all.filter((r) => r.meta?.linkId === linkId));

        it('ends the link: its address stops working, and it is recorded', async () => {
            const link = await share(cara, orderForm, { access: 'anyone' });
            expect((await call(null, 'GET', `/s/${link.token}`)).statusCode).toBe(200);

            // the admin is not a member of the project's team in any special way
            const res = await call(admin, 'DELETE', `/admin/diagrams/${orderForm}/share-links/${link.id}`);

            expect(res.statusCode).toBe(204);
            expect((await call(null, 'GET', `/s/${link.token}`)).statusCode).toBe(404);
            const row = (await links(orderForm)).find((l) => l.id === link.id)!;
            expect(row.status).toBe('revoked');
            expect(row.revokedAt).not.toBeNull();
            const logged = await rows(link.id);
            expect(logged).toHaveLength(1);
            expect(logged[0].userId).toBe(admin.id);
            expect(logged[0].meta).toEqual({ linkId: link.id });
        });

        it('tells anyone watching it live, so they are cut off', async () => {
            const link = await share(cara, orderForm, { live: true });
            const heard: string[] = [];
            const stop = onLinkChanged((id: string) => heard.push(id));
            try {
                await call(admin, 'DELETE', `/admin/diagrams/${orderForm}/share-links/${link.id}`);
            } finally {
                stop();
            }
            expect(heard).toEqual([link.id]);
        });

        it('records it once however often it is repeated', async () => {
            const link = await share(cara, orderForm);
            const url = `/admin/diagrams/${orderForm}/share-links/${link.id}`;
            expect((await call(admin, 'DELETE', url)).statusCode).toBe(204);
            const first = (await links(orderForm)).find((l) => l.id === link.id)!.revokedAt;
            expect((await call(admin, 'DELETE', url)).statusCode).toBe(204);
            expect((await links(orderForm)).find((l) => l.id === link.id)!.revokedAt).toBe(first);
            expect(await rows(link.id)).toHaveLength(1);
        });

        it('records it once when two admins do it at the same moment', async () => {
            const link = await share(cara, orderForm);
            const url = `/admin/diagrams/${orderForm}/share-links/${link.id}`;
            const [a, b] = await Promise.all([call(admin, 'DELETE', url), call(admin, 'DELETE', url)]);
            expect([a.statusCode, b.statusCode]).toEqual([204, 204]);
            expect(await rows(link.id)).toHaveLength(1);
        });

        it('will not end a link through another diagram\'s address', async () => {
            const link = await share(cara, orderForm);
            const res = await call(admin, 'DELETE', `/admin/diagrams/${invoices}/share-links/${link.id}`);
            expect(res.statusCode).toBe(404);
            expect((await links(orderForm)).find((l) => l.id === link.id)!.status).toBe('active');
        });

        it('is for admins only, even for the diagram\'s own editor', async () => {
            const link = await share(cara, orderForm);
            const url = `/admin/diagrams/${orderForm}/share-links/${link.id}`;
            expect((await call(null, 'DELETE', url)).statusCode).toBe(401);
            expect((await call(cara, 'DELETE', url)).statusCode).toBe(404);
            expect((await links(orderForm)).find((l) => l.id === link.id)!.status).toBe('active');
        });

        it('says so for a link that is not there, or an id that is not an id', async () => {
            expect(
                (
                    await call(
                        admin,
                        'DELETE',
                        `/admin/diagrams/${orderForm}/share-links/00000000-0000-4000-8000-000000000000`
                    )
                ).statusCode
            ).toBe(404);
            expect(
                (await call(admin, 'DELETE', `/admin/diagrams/${orderForm}/share-links/nope`)).statusCode
            ).toBe(400);
        });

        it('shows in the diagram list as one link fewer', async () => {
            const before = (await list()).items.find((d) => d.id === orderForm)!.activeLinks;
            const link = await share(cara, orderForm);
            expect((await list()).items.find((d) => d.id === orderForm)!.activeLinks).toBe(
                before + 1
            );
            await call(admin, 'DELETE', `/admin/diagrams/${orderForm}/share-links/${link.id}`);
            expect((await list()).items.find((d) => d.id === orderForm)!.activeLinks).toBe(before);
        });
    });
});
