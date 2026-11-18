import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    diagrams,
    driftReports,
    driftSettings,
    savedConnections,
    shareLinks,
} from '../src/db/schema.js';
import {
    as,
    createTestApp,
    registerUser,
    sampleContent,
    type TestCtx,
    type TestUser,
} from './helpers.js';

const KEY = 'a-test-key-of-at-least-16-chars';

// Access comes from a project. These tests use two projects with separate
// teams, so a user who can write somewhere is never mistaken for a user who
// can write here: every route that names a diagram, link, report or saved
// connection must refuse someone from the other project.
describe('isolation between projects', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    // editor in project A only
    let alice: TestUser;
    // editor in project B only
    let bob: TestUser;
    // viewer in project A, editor in project B
    let vera: TestUser;
    let projectA: string;
    let projectB: string;
    let slugB: string;
    let diagramA: string;
    let diagramB: string;
    let linkA: string;
    let linkB: string;
    let connectionA: string;
    let connectionB: string;
    let reportB: string;

    const inject = (
        who: TestUser | null,
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        url: string,
        payload?: object
    ) =>
        ctx.app.inject({
            method,
            url,
            headers: who ? as(who) : undefined,
            ...(payload !== undefined ? { payload } : {}),
        });

    async function makeProject(name: string) {
        const res = await inject(admin, 'POST', '/admin/projects', { name });
        expect(res.statusCode).toBe(201);
        return res.json() as { id: string; slug: string };
    }

    async function member(projectId: string, user: TestUser, role: 'editor' | 'viewer') {
        const res = await inject(admin, 'PUT', `/admin/projects/${projectId}/members/${user.id}`, {
            role,
        });
        expect(res.statusCode).toBe(200);
    }

    async function diagramIn(user: TestUser, projectId: string, title: string) {
        const res = await inject(user, 'POST', '/diagrams', {
            title,
            content: sampleContent,
            projectId,
        });
        expect(res.statusCode).toBe(201);
        return res.json().id as string;
    }

    async function connectionIn(user: TestUser, projectId: string, name: string) {
        const res = await inject(user, 'POST', '/introspect/connections', {
            name,
            projectId,
            dialect: 'postgresql',
            host: 'db.example.com',
            database: 'shop',
            user: 'reader',
            password: `secret-of-${name}`,
        });
        expect(res.statusCode).toBe(201);
        return res.json().id as string;
    }

    beforeAll(async () => {
        ctx = await createTestApp({ connectionKey: KEY, secretsKey: KEY });
        admin = await registerUser(ctx.app, 'admin@example.com');
        alice = await registerUser(ctx.app, 'alice@example.com');
        bob = await registerUser(ctx.app, 'bob@example.com');
        vera = await registerUser(ctx.app, 'vera@example.com');
        ({ id: projectA } = await makeProject('Alpha'));
        ({ id: projectB, slug: slugB } = await makeProject('Bravo'));
        await member(projectA, alice, 'editor');
        await member(projectB, bob, 'editor');
        await member(projectA, vera, 'viewer');
        await member(projectB, vera, 'editor');

        diagramA = await diagramIn(alice, projectA, 'Alpha schema');
        diagramB = await diagramIn(bob, projectB, 'Bravo schema');
        // both published, so a viewer of A could read A
        for (const [who, id] of [
            [alice, diagramA],
            [bob, diagramB],
        ] as const) {
            expect((await inject(who, 'POST', `/diagrams/${id}/publish`, {})).statusCode).toBe(201);
        }
        linkA = (await inject(alice, 'POST', `/diagrams/${diagramA}/share-links`, {})).json().id;
        linkB = (await inject(bob, 'POST', `/diagrams/${diagramB}/share-links`, {})).json().id;
        connectionA = await connectionIn(alice, projectA, 'alpha-db');
        connectionB = await connectionIn(bob, projectB, 'bravo-db');
        const [report] = await ctx.db
            .insert(driftReports)
            .values({ diagramId: diagramB, status: 'clean', trigger: 'manual' })
            .returning({ id: driftReports.id });
        reportB = report.id;
    });
    afterAll(() => ctx.close());

    describe('a member of another project', () => {
        it('cannot read, list or find the other project', async () => {
            expect((await inject(alice, 'GET', `/projects/${projectB}`)).statusCode).toBe(404);
            expect((await inject(alice, 'GET', `/projects/${slugB}`)).statusCode).toBe(404);
            const mine = await inject(alice, 'GET', '/projects');
            expect(mine.statusCode).toBe(200);
            const ids = mine.json().items.map((p: { id: string }) => p.id);
            expect(ids).toEqual([projectA]);
        });

        it('gets an empty list when filtering by the other project', async () => {
            const res = await inject(alice, 'GET', `/diagrams?projectId=${projectB}`);
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual([]);
            const all = await inject(alice, 'GET', '/diagrams');
            expect(all.json().map((d: { id: string }) => d.id)).toEqual([diagramA]);
        });

        it('cannot create a diagram in the other project', async () => {
            const res = await inject(alice, 'POST', '/diagrams', {
                title: 'Planted',
                content: sampleContent,
                projectId: projectB,
            });
            expect(res.statusCode).toBe(404);
            const planted = await ctx.db
                .select({ id: diagrams.id })
                .from(diagrams)
                .where(eq(diagrams.title, 'Planted'));
            expect(planted).toEqual([]);
        });

        it.each([
            ['GET', ''],
            ['GET', '/summary'],
            ['GET', '/publish-status'],
            ['GET', '/versions'],
            ['GET', '/versions/1'],
            ['GET', '/members'],
            ['GET', '/lint'],
            ['GET', '/lint?source=published'],
            ['GET', '/lint-config'],
            ['GET', '/drift'],
            ['GET', '/drift/reports'],
            ['GET', '/share-links'],
        ] as const)('gets 404 for %s on the diagram%s', async (method, suffix) => {
            const res = await inject(alice, method, `/diagrams/${diagramB}${suffix}`);
            expect(res.statusCode).toBe(404);
            // nothing of the diagram leaks into the refusal
            expect(res.body).not.toContain('Bravo');
        });

        it('cannot change, lock, publish or delete the diagram', async () => {
            const before = await ctx.db.select().from(diagrams).where(eq(diagrams.id, diagramB));
            const attempts = [
                inject(alice, 'PUT', `/diagrams/${diagramB}`, { title: 'Owned' }),
                inject(alice, 'POST', `/diagrams/${diagramB}/lock`, { editorId: 'tab-1' }),
                inject(alice, 'POST', `/diagrams/${diagramB}/lock/poke`, { editorId: 'tab-1' }),
                inject(alice, 'POST', `/diagrams/${diagramB}/publish`, {}),
                inject(alice, 'PUT', `/diagrams/${diagramB}/lint-config`, { config: {} }),
                inject(alice, 'PUT', `/diagrams/${diagramB}/drift`, { connectionId: null }),
                inject(alice, 'POST', `/diagrams/${diagramB}/drift/check`, {}),
                inject(alice, 'POST', `/diagrams/${diagramB}/drift/dismiss`, {}),
                inject(alice, 'DELETE', `/diagrams/${diagramB}`),
            ];
            for (const res of await Promise.all(attempts)) {
                expect(res.statusCode).toBe(404);
            }
            const after = await ctx.db.select().from(diagrams).where(eq(diagrams.id, diagramB));
            expect(after).toEqual(before);
            const settings = await ctx.db
                .select()
                .from(driftSettings)
                .where(eq(driftSettings.diagramId, diagramB));
            expect(settings).toEqual([]);
        });

        it('cannot release the edit lock someone else holds', async () => {
            const taken = await inject(bob, 'POST', `/diagrams/${diagramB}/lock`, {
                editorId: 'bob-tab',
            });
            expect(taken.json()).toEqual({ held: true });
            // releasing answers 204 whoever asks, but only ever lets go of the caller's own lock
            const release = await inject(
                alice,
                'DELETE',
                `/diagrams/${diagramB}/lock?editorId=bob-tab`
            );
            expect(release.statusCode).toBe(204);
            const still = await inject(bob, 'POST', `/diagrams/${diagramB}/lock`, {
                editorId: 'bob-tab',
            });
            expect(still.json()).toEqual({ held: true });
            // and a second editor of B still finds it held by bob
            const other = await inject(vera, 'POST', `/diagrams/${diagramB}/lock`, {
                editorId: 'vera-tab',
            });
            expect(other.json().held).toBe(false);
            await inject(bob, 'DELETE', `/diagrams/${diagramB}/lock?editorId=bob-tab`);
        });

        it('cannot read a drift report of the other diagram', async () => {
            const res = await inject(alice, 'GET', `/diagrams/${diagramB}/drift/reports/${reportB}`);
            expect(res.statusCode).toBe(404);
        });

        it('cannot manage the other diagram’s share links', async () => {
            const attempts = [
                inject(alice, 'POST', `/diagrams/${diagramB}/share-links`, {}),
                inject(alice, 'PATCH', `/diagrams/${diagramB}/share-links/${linkB}`, {
                    access: 'off',
                }),
                inject(alice, 'POST', `/diagrams/${diagramB}/share-links/${linkB}/regenerate`, {}),
                inject(alice, 'DELETE', `/diagrams/${diagramB}/share-links/${linkB}`),
            ];
            for (const res of await Promise.all(attempts)) {
                expect(res.statusCode).toBe(404);
            }
            const [link] = await ctx.db.select().from(shareLinks).where(eq(shareLinks.id, linkB));
            expect(link.access).toBe('anyone');
            expect(link.revokedAt).toBeNull();
            const links = await ctx.db
                .select({ id: shareLinks.id })
                .from(shareLinks)
                .where(eq(shareLinks.diagramId, diagramB));
            expect(links).toHaveLength(1);
        });
    });

    describe('ids from another diagram', () => {
        // the caller can write diagram A, and names B's link under A's path
        it('do not let a writer reach another diagram’s link through their own', async () => {
            const attempts = [
                inject(alice, 'PATCH', `/diagrams/${diagramA}/share-links/${linkB}`, {
                    access: 'off',
                }),
                inject(alice, 'POST', `/diagrams/${diagramA}/share-links/${linkB}/regenerate`, {}),
                inject(alice, 'DELETE', `/diagrams/${diagramA}/share-links/${linkB}`),
            ];
            for (const res of await Promise.all(attempts)) {
                expect(res.statusCode).toBe(404);
            }
            const [link] = await ctx.db.select().from(shareLinks).where(eq(shareLinks.id, linkB));
            expect(link.access).toBe('anyone');
            expect(link.revokedAt).toBeNull();
            expect(link.diagramId).toBe(diagramB);
        });

        it('do not let a writer read another diagram’s drift report through their own', async () => {
            const res = await inject(alice, 'GET', `/diagrams/${diagramA}/drift/reports/${reportB}`);
            expect(res.statusCode).toBe(404);
        });

        it('do not let a diagram’s drift check use another project’s saved connection', async () => {
            const res = await inject(alice, 'PUT', `/diagrams/${diagramA}/drift`, {
                connectionId: connectionB,
            });
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toBe('connection_not_found');
            const settings = await ctx.db
                .select()
                .from(driftSettings)
                .where(eq(driftSettings.diagramId, diagramA));
            expect(settings).toEqual([]);
        });

        it('still let the owner of the link manage it under its own diagram', async () => {
            const res = await inject(alice, 'PATCH', `/diagrams/${diagramA}/share-links/${linkA}`, {
                live: true,
            });
            expect(res.statusCode).toBe(200);
            expect(res.json().live).toBe(true);
        });
    });

    describe('saving a diagram', () => {
        it('ignores fields that would move it to another project or owner', async () => {
            const res = await inject(alice, 'PUT', `/diagrams/${diagramA}`, {
                title: 'Alpha renamed',
                projectId: projectB,
                ownerId: bob.id,
                id: diagramB,
            });
            expect(res.statusCode).toBe(200);
            const [row] = await ctx.db.select().from(diagrams).where(eq(diagrams.id, diagramA));
            expect(row.title).toBe('Alpha renamed');
            expect(row.projectId).toBe(projectA);
            expect(row.ownerId).toBe(alice.id);
            const [other] = await ctx.db.select().from(diagrams).where(eq(diagrams.id, diagramB));
            expect(other.title).toBe('Bravo schema');
        });

        it('does not let the creator pick another owner', async () => {
            const res = await inject(alice, 'POST', '/diagrams', {
                title: 'Mine',
                content: sampleContent,
                projectId: projectA,
                ownerId: bob.id,
            });
            expect(res.statusCode).toBe(201);
            const [row] = await ctx.db
                .select({ ownerId: diagrams.ownerId })
                .from(diagrams)
                .where(eq(diagrams.id, res.json().id));
            expect(row.ownerId).toBe(alice.id);
        });
    });

    describe('saved connections', () => {
        it('are not listed to editors of another project', async () => {
            const res = await inject(alice, 'GET', `/introspect/connections?projectId=${projectB}`);
            expect(res.statusCode).toBe(404);
        });

        it('cannot be changed or deleted from another project', async () => {
            const before = await ctx.db
                .select()
                .from(savedConnections)
                .where(eq(savedConnections.id, connectionB));
            const put = await inject(alice, 'PUT', `/introspect/connections/${connectionB}`, {
                name: 'hijacked',
                dialect: 'postgresql',
                host: 'attacker.example.com',
                database: 'shop',
                user: 'reader',
                password: 'x',
            });
            expect(put.statusCode).toBe(404);
            const del = await inject(alice, 'DELETE', `/introspect/connections/${connectionB}`);
            expect(del.statusCode).toBe(404);
            const after = await ctx.db
                .select()
                .from(savedConnections)
                .where(eq(savedConnections.id, connectionB));
            expect(after).toEqual(before);
        });

        it('cannot be used to read a database from another project', async () => {
            for (const url of ['/introspect', '/introspect/catalog']) {
                const res = await inject(alice, 'POST', url, { savedConnectionId: connectionB });
                expect(res.statusCode).toBe(404);
                // neither the host nor the stored password comes back
                expect(res.body).not.toContain('db.example.com');
                expect(res.body).not.toContain('secret-of');
            }
        });

        it('cannot be saved into a project the caller does not belong to', async () => {
            const res = await inject(alice, 'POST', '/introspect/connections', {
                name: 'planted',
                projectId: projectB,
                dialect: 'postgresql',
                host: 'db.example.com',
                database: 'shop',
                user: 'reader',
                password: 'x',
            });
            expect(res.statusCode).toBe(404);
        });

        it('are closed to a viewer of their project even if they edit elsewhere', async () => {
            // vera writes in B, but only views A
            expect(
                (await inject(vera, 'GET', `/introspect/connections?projectId=${projectA}`)).statusCode
            ).toBe(403);
            const use = await inject(vera, 'POST', '/introspect/catalog', {
                savedConnectionId: connectionA,
            });
            expect(use.statusCode).toBe(404);
            const del = await inject(vera, 'DELETE', `/introspect/connections/${connectionA}`);
            expect(del.statusCode).toBe(403);
            const rows = await ctx.db
                .select({ id: savedConnections.id })
                .from(savedConnections)
                .where(eq(savedConnections.id, connectionA));
            expect(rows).toHaveLength(1);
        });
    });

    describe('a user with different roles in two projects', () => {
        it('keeps the viewer role in the project where it is a viewer', async () => {
            const read = await inject(vera, 'GET', `/diagrams/${diagramA}`);
            expect(read.statusCode).toBe(200);
            expect(read.json().role).toBe('viewer');
            for (const res of [
                await inject(vera, 'PUT', `/diagrams/${diagramA}`, { title: 'Nope' }),
                await inject(vera, 'POST', `/diagrams/${diagramA}/publish`, {}),
                await inject(vera, 'POST', `/diagrams/${diagramA}/share-links`, {}),
                await inject(vera, 'GET', `/diagrams/${diagramA}/share-links`),
                await inject(vera, 'GET', `/diagrams/${diagramA}/members`),
                await inject(vera, 'GET', `/diagrams/${diagramA}/drift`),
                await inject(vera, 'PUT', `/diagrams/${diagramA}/lint-config`, { config: {} }),
                await inject(vera, 'POST', '/diagrams', {
                    title: 'Viewer made',
                    content: sampleContent,
                    projectId: projectA,
                }),
            ]) {
                expect(res.statusCode).toBe(403);
            }
        });

        it('writes in the project where it is an editor', async () => {
            const res = await inject(vera, 'PUT', `/diagrams/${diagramB}`, { title: 'Bravo by Vera' });
            expect(res.statusCode).toBe(200);
            await inject(bob, 'PUT', `/diagrams/${diagramB}`, { title: 'Bravo schema' });
        });
    });

    describe('losing access', () => {
        it('takes effect on the next request, with the session still open', async () => {
            const carol = await registerUser(ctx.app, 'carol@example.com');
            await member(projectB, carol, 'editor');
            expect((await inject(carol, 'GET', `/diagrams/${diagramB}`)).statusCode).toBe(200);
            const removed = await inject(
                admin,
                'DELETE',
                `/admin/projects/${projectB}/members/${carol.id}`
            );
            expect(removed.statusCode).toBe(204);
            expect((await inject(carol, 'GET', `/diagrams/${diagramB}`)).statusCode).toBe(404);
            expect(
                (await inject(carol, 'PUT', `/diagrams/${diagramB}`, { title: 'late' })).statusCode
            ).toBe(404);
            expect(
                (await inject(carol, 'GET', `/diagrams/${diagramB}/share-links`)).statusCode
            ).toBe(404);
        });
    });

    describe('ids that do not exist', () => {
        it('answer 404, the same as ids the caller may not see', async () => {
            const ghost = randomUUID();
            for (const url of [
                `/diagrams/${ghost}`,
                `/diagrams/${ghost}/summary`,
                `/diagrams/${ghost}/members`,
                `/diagrams/${ghost}/share-links`,
                `/diagrams/${ghost}/drift`,
                `/projects/${ghost}`,
            ]) {
                const unseen = await inject(alice, 'GET', url);
                expect(unseen.statusCode).toBe(404);
                expect(unseen.json().error).toBe('not_found');
            }
            const missingLink = await inject(
                alice,
                'DELETE',
                `/diagrams/${diagramA}/share-links/${ghost}`
            );
            expect(missingLink.statusCode).toBe(404);
        });
    });
});
