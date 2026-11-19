import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { auditLog, diagramLocks, diagrams, projects, sessions, shareLinks } from '../src/db/schema.js';
import { onLinkChanged } from '../src/events.js';
import {
    as,
    createTestApp,
    loginUser,
    registerUser,
    sampleContent,
    type TestCtx,
    type TestUser,
} from './helpers.js';

describe('admin panel and projects', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let editor: TestUser;
    let viewer: TestUser;
    let stranger: TestUser;
    let projectId: string;
    let diagramId: string;

    // what the admin sends to delete a project: their own password (SEC-048)
    const proof = { adminPassword: 'Password-123!' };

    const call = (
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        url: string,
        user?: TestUser,
        payload?: unknown
    ) =>
        ctx.app.inject({
            method,
            url,
            headers: user ? as(user) : undefined,
            payload: payload as object | undefined,
        });

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
        editor = await registerUser(ctx.app, 'editor@example.com');
        viewer = await registerUser(ctx.app, 'viewer@example.com');
        stranger = await registerUser(ctx.app, 'stranger@example.com');

        const p = await call('POST', '/admin/projects', admin, {
            name: 'Billing',
            description: 'Billing schemas',
        });
        projectId = p.json().id;
        await call('PUT', `/admin/projects/${projectId}/members/${editor.id}`, admin, {
            role: 'editor',
        });
        await call('PUT', `/admin/projects/${projectId}/members/${viewer.id}`, admin, {
            role: 'viewer',
        });
        const d = await call('POST', '/diagrams', editor, {
            title: 'Invoices',
            content: sampleContent,
            projectId,
        });
        diagramId = d.json().id;
        // viewers are shown published diagrams only
        await call('POST', `/diagrams/${diagramId}/publish`, editor, {});
    });
    afterAll(() => ctx.close());

    describe('admin-only access', () => {
        it('rejects anonymous requests with 401', async () => {
            expect((await call('GET', '/admin/users')).statusCode).toBe(401);
        });

        it('hides the admin API from non-admins with 404', async () => {
            for (const u of [editor, viewer, stranger]) {
                expect((await call('GET', '/admin/users', u)).statusCode).toBe(404);
                expect((await call('GET', '/admin/projects', u)).statusCode).toBe(404);
                const create = await call('POST', '/admin/users', u, {
                    email: 'sneaky@example.com',
                    password: 'Password-123!',
                });
                expect(create.statusCode).toBe(404);
                const proj = await call('POST', '/admin/projects', u, { name: 'Mine' });
                expect(proj.statusCode).toBe(404);
            }
        });

        it('lets an admin create users and promote them', async () => {
            const res = await call('POST', '/admin/users', admin, {
                email: 'New.Person@Example.com',
                password: 'Password-123!',
            });
            expect(res.statusCode).toBe(201);
            expect(res.json().email).toBe('new.person@example.com');
            expect(res.json().isAdmin).toBe(false);
            const login = await loginUser(ctx.app, 'new.person@example.com');
            expect(login.id).toBe(res.json().id);

            const promote = await call('PATCH', `/admin/users/${login.id}`, admin, {
                isAdmin: true,
                adminPassword: 'Password-123!',
            });
            expect(promote.statusCode).toBe(200);
            const me = await call('GET', '/auth/me', login);
            expect(me.json().isAdmin).toBe(true);
        });

        it('lists users with their project counts', async () => {
            const res = await call('GET', '/admin/users', admin);
            const row = res
                .json()
                .items.find((u: { email: string }) => u.email === 'editor@example.com');
            expect(row.projects).toBe(1);
        });

        it('resets a password and signs the user out everywhere', async () => {
            const target = await registerUser(ctx.app, 'reset@example.com');
            const reset = await call('PATCH', `/admin/users/${target.id}`, admin, {
                password: 'Brand-new-password-1!',
            });
            expect(reset.statusCode).toBe(200);
            expect((await call('GET', '/auth/me', target)).statusCode).toBe(401);
            expect(
                (
                    await ctx.app.inject({
                        method: 'POST',
                        url: '/auth/login',
                        payload: {
                            email: 'reset@example.com',
                            password: 'Password-123!',
                        },
                    })
                ).statusCode
            ).toBe(401);
            await loginUser(ctx.app, 'reset@example.com', 'Brand-new-password-1!');
        });
    });

    describe('projects', () => {
        it('rejects duplicate project names', async () => {
            const res = await call('POST', '/admin/projects', admin, { name: 'Billing' });
            expect(res.statusCode).toBe(409);
        });

        it('lists members of a project with their roles', async () => {
            const res = await call('GET', `/admin/projects/${projectId}/members`, admin);
            const roles = Object.fromEntries(
                res.json().map((m: { email: string; role: string }) => [m.email, m.role])
            );
            expect(roles).toMatchObject({
                'editor@example.com': 'editor',
                'viewer@example.com': 'viewer',
            });
        });

        it('shows each user only the projects they were assigned', async () => {
            const mine = await call('GET', '/projects', viewer);
            expect(mine.json().items).toEqual([
                expect.objectContaining({ id: projectId, role: 'viewer' }),
            ]);
            expect(mine.json().total).toBe(1);
            expect((await call('GET', '/projects', stranger)).json().items).toEqual(
                []
            );
            const all = await call('GET', '/projects', admin);
            expect(all.json().items.length).toBeGreaterThanOrEqual(1);
        });

        it('changes a role by assigning again, and removes access on unassign', async () => {
            const temp = await registerUser(ctx.app, 'temp@example.com');
            const put = (role: string) =>
                call('PUT', `/admin/projects/${projectId}/members/${temp.id}`, admin, { role });
            expect((await put('viewer')).statusCode).toBe(200);
            expect((await call('GET', `/diagrams/${diagramId}`, temp)).statusCode).toBe(200);
            expect(
                (
                    await call('PUT', `/diagrams/${diagramId}`, temp, {
                        title: 'nope',
                    })
                ).statusCode
            ).toBe(403);
            await put('editor');
            expect(
                (
                    await call('PUT', `/diagrams/${diagramId}`, temp, {
                        title: 'Invoices',
                    })
                ).statusCode
            ).toBe(200);
            const del = await call(
                'DELETE',
                `/admin/projects/${projectId}/members/${temp.id}`,
                admin
            );
            expect(del.statusCode).toBe(204);
            expect((await call('GET', `/diagrams/${diagramId}`, temp)).statusCode).toBe(404);
        });
    });

    describe('permissions on project diagrams', () => {
        it('lets members read, strangers see nothing', async () => {
            expect((await call('GET', `/diagrams/${diagramId}`, viewer)).statusCode).toBe(200);
            expect((await call('GET', `/diagrams/${diagramId}`, editor)).statusCode).toBe(200);
            expect((await call('GET', `/diagrams/${diagramId}`, admin)).statusCode).toBe(200);
            expect((await call('GET', `/diagrams/${diagramId}`, stranger)).statusCode).toBe(404);
        });

        it('lets editors write but not viewers', async () => {
            // the admin's earlier save still holds the diagram's edit lock
            await ctx.db.delete(diagramLocks);
            const ok = await call('PUT', `/diagrams/${diagramId}`, editor, {
                title: 'Invoices v2',
            });
            expect(ok.statusCode).toBe(200);
            const no = await call('PUT', `/diagrams/${diagramId}`, viewer, {
                title: 'hijack',
            });
            expect(no.statusCode).toBe(403);
            const publish = await call('POST', `/diagrams/${diagramId}/publish`, viewer, {});
            expect(publish.statusCode).toBe(403);
        });

        it('lets only admins delete a project diagram', async () => {
            expect((await call('DELETE', `/diagrams/${diagramId}`, editor)).statusCode).toBe(403);
            expect((await call('DELETE', `/diagrams/${diagramId}`, viewer)).statusCode).toBe(403);
        });

        it('only lets writers create diagrams in a project', async () => {
            const body = { title: 'X', content: sampleContent, projectId };
            expect((await call('POST', '/diagrams', viewer, body)).statusCode).toBe(403);
            expect((await call('POST', '/diagrams', stranger, body)).statusCode).toBe(404);
            expect((await call('POST', '/diagrams', admin, body)).statusCode).toBe(201);
            const missing = await call('POST', '/diagrams', editor, {
                ...body,
                projectId: '00000000-0000-4000-8000-000000000000',
            });
            expect(missing.statusCode).toBe(404);
        });

        it('lists project diagrams for members and admins only', async () => {
            const titles = async (u: TestUser) =>
                (await call('GET', '/diagrams', u))
                    .json()
                    .map((d: { id: string }) => d.id);
            expect(await titles(editor)).toContain(diagramId);
            expect(await titles(viewer)).toContain(diagramId);
            expect(await titles(admin)).toContain(diagramId);
            expect(await titles(stranger)).not.toContain(diagramId);
            const row = (await call('GET', '/diagrams', editor))
                .json()
                .find((d: { id: string }) => d.id === diagramId);
            expect(row.role).toBe('editor');
            expect(row.projectId).toBe(projectId);
        });

        it('gives viewers only published content', async () => {
            await call('POST', `/diagrams/${diagramId}/publish`, editor, {});
            await call('PUT', `/diagrams/${diagramId}`, editor, { title: 'Draft rename' });
            const row = (await call('GET', '/diagrams', viewer))
                .json()
                .find((d: { id: string }) => d.id === diagramId);
            expect(row.title).not.toBe('Draft rename');
        });

        it('shows project members on the diagram, read-only', async () => {
            const list = await call('GET', `/diagrams/${diagramId}/members`, editor);
            expect(list.statusCode).toBe(200);
            expect(list.json().map((m: { email: string }) => m.email)).toContain(
                'editor@example.com'
            );
            const add = await call('POST', `/diagrams/${diagramId}/members`, admin, {
                email: 'stranger@example.com',
                role: 'viewer',
            });
            expect(add.statusCode).toBe(404);
        });

        it('refuses to create a diagram without a project', async () => {
            for (const u of [admin, editor]) {
                const res = await call('POST', '/diagrams', u, {
                    title: 'Loose',
                    content: sampleContent,
                });
                expect(res.statusCode).toBe(400);
            }
        });
    });

    describe('project URLs (slugs)', () => {
        const create = (name: string) =>
            call('POST', '/admin/projects', admin, { name });

        it('gives every project a URL piece built from its name', async () => {
            const res = await create('Merme Team');
            expect(res.statusCode).toBe(201);
            expect(res.json().slug).toBe('Merme-Team');
            const first = (await call('GET', '/admin/projects', admin))
                .json()
                .items.find((p: { id: string }) => p.id === projectId);
            expect(first.slug).toBe('Billing');
        });

        it('shows the slug to members, so the app can build /Billing/diagrams', async () => {
            const mine = await call('GET', '/projects', viewer);
            expect(mine.json().items[0]).toMatchObject({
                id: projectId,
                slug: 'Billing',
            });
            const all = await call('GET', '/projects', admin);
            expect(all.json().items.every((p: { slug: string }) => !!p.slug)).toBe(true);
        });

        it('rejects names that cannot be a URL or that shadow an app path', async () => {
            expect((await create('???')).json().error).toBe('invalid_name');
            for (const name of ['admin', 'Diagrams', 'S', 'templates']) {
                const res = await create(name);
                expect(res.statusCode, name).toBe(400);
                expect(res.json().error, name).toBe('reserved_name');
            }
        });

        it('refuses a name whose URL is already taken, ignoring case and spacing', async () => {
            for (const name of ['billing', 'BILLING', ' Billing ', 'Merme  Team']) {
                const res = await create(name);
                expect(res.statusCode, name).toBe(409);
            }
        });

        it('changes the URL when the project is renamed, and frees the old one', async () => {
            const p = (await create('Old Name')).json();
            const renamed = await call('PATCH', `/admin/projects/${p.id}`, admin, {
                name: 'New Name',
            });
            expect(renamed.statusCode).toBe(200);
            expect(renamed.json().slug).toBe('New-Name');
            expect((await create('Old Name')).statusCode).toBe(201);
        });

        it('lets a project keep its own URL when only the description changes', async () => {
            const res = await call('PATCH', `/admin/projects/${projectId}`, admin, {
                description: 'Billing schemas (updated)',
            });
            expect(res.statusCode).toBe(200);
            expect(res.json().slug).toBe('Billing');
        });

        it('rejects renaming a project onto another project’s URL', async () => {
            const p = (await create('Rename Me')).json();
            const res = await call('PATCH', `/admin/projects/${p.id}`, admin, {
                name: 'billing',
            });
            expect(res.statusCode).toBe(409);
        });

        it('tells diagrams which project they are in', async () => {
            const res = await call('GET', `/diagrams/${diagramId}`, editor);
            expect(res.json().projectId).toBe(projectId);
        });
    });

    describe('project list order', () => {
        // created one after another: Mango, Apple, Zebra (the search keeps the
        // other tests' projects out of the list)
        const names = async (query: string) =>
            (await call('GET', `/admin/projects?q=Sortx${query}`, admin))
                .json()
                .items.map((p: { name: string }) => p.name);

        beforeAll(async () => {
            for (const n of ['Sortx Mango', 'Sortx Apple', 'Sortx Zebra']) {
                await call('POST', '/admin/projects', admin, { name: n });
                await new Promise((r) => setTimeout(r, 5));
            }
        });

        it('is by name, A to Z, unless asked otherwise', async () => {
            const all = ['Sortx Apple', 'Sortx Mango', 'Sortx Zebra'];
            expect(await names('')).toEqual(all);
            expect(await names('&sort=name_asc')).toEqual(all);
        });

        it('can be by name, Z to A', async () => {
            expect(await names('&sort=name_desc')).toEqual([
                'Sortx Zebra',
                'Sortx Mango',
                'Sortx Apple',
            ]);
        });

        it('can be by creation date, newest or oldest first', async () => {
            expect(await names('&sort=created_desc')).toEqual([
                'Sortx Zebra',
                'Sortx Apple',
                'Sortx Mango',
            ]);
            expect(await names('&sort=created_asc')).toEqual([
                'Sortx Mango',
                'Sortx Apple',
                'Sortx Zebra',
            ]);
        });

        it('keeps the order across pages', async () => {
            const first = await call(
                'GET',
                '/admin/projects?q=Sortx&sort=name_desc&limit=2',
                admin
            );
            const second = await call(
                'GET',
                '/admin/projects?q=Sortx&sort=name_desc&limit=2&page=2',
                admin
            );
            expect(first.json().items.map((p: { name: string }) => p.name)).toEqual([
                'Sortx Zebra',
                'Sortx Mango',
            ]);
            expect(second.json().items.map((p: { name: string }) => p.name)).toEqual([
                'Sortx Apple',
            ]);
        });

        it('refuses an unknown order', async () => {
            const res = await call('GET', '/admin/projects?sort=random', admin);
            expect(res.statusCode).toBe(400);
        });
    });

    describe('cleanup rules', () => {
        it('deletes a project together with its diagrams and everything attached', async () => {
            const p = (await call('POST', '/admin/projects', admin, { name: 'Doomed' })).json();
            const [d] = await ctx.db
                .insert(diagrams)
                .values({
                    ownerId: admin.id,
                    projectId: p.id,
                    title: 'Inside',
                    content: sampleContent,
                })
                .returning({ id: diagrams.id });
            const res = await call('DELETE', `/admin/projects/${p.id}`, admin, proof);
            expect(res.statusCode).toBe(204);
            const left = await ctx.db.select({ id: diagrams.id }).from(diagrams).where(eq(diagrams.id, d.id));
            expect(left).toHaveLength(0);
            expect((await call('GET', `/admin/projects/${p.id}/members`, admin)).statusCode).toBe(404);
        });

        it('SRV-046: tells the open share streams of its diagrams that their links are gone, once the delete is done', async () => {
            const p = (await call('POST', '/admin/projects', admin, { name: 'Doomed links' })).json();
            const ids: string[] = [];
            for (const title of ['One', 'Two']) {
                const [d] = await ctx.db
                    .insert(diagrams)
                    .values({ ownerId: admin.id, projectId: p.id, title, content: sampleContent })
                    .returning({ id: diagrams.id });
                const [link] = await ctx.db
                    .insert(shareLinks)
                    .values({
                        diagramId: d.id,
                        tokenHash: `srv046-${title}-${Math.random()}`,
                        createdBy: admin.id,
                        live: true,
                    })
                    .returning({ id: shareLinks.id });
                ids.push(link.id);
            }
            const heard: string[] = [];
            const stop = onLinkChanged((id: string) => heard.push(id));
            try {
                const res = await call('DELETE', `/admin/projects/${p.id}`, admin, proof);
                expect(res.statusCode).toBe(204);
            } finally {
                stop();
            }
            expect(heard.sort()).toEqual([...ids].sort());
        });

        it('SEC-048: asks for the admin\'s own password before it deletes anything', async () => {
            const p = (await call('POST', '/admin/projects', admin, { name: 'Needs proof' })).json();
            const [d] = await ctx.db
                .insert(diagrams)
                .values({ ownerId: admin.id, projectId: p.id, title: 'Inside', content: sampleContent })
                .returning({ id: diagrams.id });
            const intact = async () => ({
                project: (await ctx.db.select({ id: projects.id }).from(projects).where(eq(projects.id, p.id))).length,
                diagram: (await ctx.db.select({ id: diagrams.id }).from(diagrams).where(eq(diagrams.id, d.id))).length,
            });

            // a stolen session sends nothing more than the cookie
            const none = await call('DELETE', `/admin/projects/${p.id}`, admin);
            expect(none.statusCode).toBe(403);
            expect(none.json()).toEqual({ error: 'step_up_required' });
            expect(await intact()).toEqual({ project: 1, diagram: 1 });

            const wrong = await call('DELETE', `/admin/projects/${p.id}`, admin, { adminPassword: 'not-it' });
            expect(wrong.statusCode).toBe(403);
            expect(wrong.json()).toEqual({ error: 'wrong_password' });
            expect(await intact()).toEqual({ project: 1, diagram: 1 });

            const ok = await call('DELETE', `/admin/projects/${p.id}`, admin, proof);
            expect(ok.statusCode).toBe(204);
            expect(await intact()).toEqual({ project: 0, diagram: 0 });
        });

        it('SEC-048: asks before saying a project does not exist, so a probe learns nothing', async () => {
            const res = await call('DELETE', '/admin/projects/00000000-0000-4000-8000-000000000000', admin);
            expect(res.statusCode).toBe(403);
        });

        it('answers 404 for a project that does not exist', async () => {
            const res = await call('DELETE', '/admin/projects/00000000-0000-4000-8000-000000000000', admin, proof);
            expect(res.statusCode).toBe(404);
        });

        it('writes the delete audit row in the delete transaction: no row when the delete rolls back', async () => {
            const p = (await call('POST', '/admin/projects', admin, { name: 'Rolls back' })).json();
            const before = await ctx.db
                .select({ id: auditLog.id })
                .from(auditLog)
                .where(eq(auditLog.action, 'project.delete'));
            // a trigger that refuses the audit row makes the whole delete fail
            await ctx.db.execute(sql`
                create function aud_refuse_project_delete() returns trigger language plpgsql as
                $$ begin if new.action = 'project.delete' then raise exception 'refused'; end if; return new; end $$`);
            await ctx.db.execute(
                sql`create trigger aud_refuse before insert on audit_log for each row execute function aud_refuse_project_delete()`
            );
            try {
                const res = await call('DELETE', `/admin/projects/${p.id}`, admin, proof);
                expect(res.statusCode).toBe(500);
            } finally {
                await ctx.db.execute(sql`drop trigger aud_refuse on audit_log`);
                await ctx.db.execute(sql`drop function aud_refuse_project_delete()`);
            }
            const stillThere = await ctx.db.select({ id: projects.id }).from(projects).where(eq(projects.id, p.id));
            expect(stillThere).toHaveLength(1);
            const after = await ctx.db
                .select({ id: auditLog.id })
                .from(auditLog)
                .where(eq(auditLog.action, 'project.delete'));
            expect(after).toHaveLength(before.length);
        });

        it('takes a diagram created at the same moment along, instead of failing with 500', async () => {
            const p = (await call('POST', '/admin/projects', admin, { name: 'Race' })).json();
            let created = '';
            let release: () => void = () => undefined;
            const gate = new Promise<void>((resolve) => (release = resolve));
            // a diagram inserted but not yet committed holds a share lock on the project row
            const inserting = ctx.db.transaction(async (tx) => {
                const [row] = await tx
                    .insert(diagrams)
                    .values({ ownerId: admin.id, projectId: p.id, title: 'Late', content: sampleContent })
                    .returning({ id: diagrams.id });
                created = row.id;
                await gate;
            });
            await vi.waitFor(() => expect(created).not.toBe(''));
            const deleting = call('DELETE', `/admin/projects/${p.id}`, admin, proof);
            // the delete is waiting for the insert; let it commit
            await new Promise((r) => setTimeout(r, 200));
            release();
            await inserting;
            const res = await deleting;
            expect(res.statusCode).toBe(204);
            const left = await ctx.db.select({ id: diagrams.id }).from(diagrams).where(eq(diagrams.id, created));
            expect(left).toHaveLength(0);
        });

        it('deletes an empty project', async () => {
            const p = await call('POST', '/admin/projects', admin, { name: 'Scratch' });
            const res = await call('DELETE', `/admin/projects/${p.json().id}`, admin, proof);
            expect(res.statusCode).toBe(204);
        });

        it('keeps project diagrams when their creator is deleted', async () => {
            const author = await registerUser(ctx.app, 'author@example.com');
            await call('PUT', `/admin/projects/${projectId}/members/${author.id}`, admin, {
                role: 'editor',
            });
            const d = await call('POST', '/diagrams', author, {
                title: 'By author',
                content: sampleContent,
                projectId,
            });
            const id = d.json().id;
            const del = await call('DELETE', `/admin/users/${author.id}`, admin);
            expect(del.statusCode).toBe(204);
            const [row] = await ctx.db.select().from(diagrams).where(eq(diagrams.id, id));
            expect(row).toBeDefined();
            expect(row.ownerId).toBe(admin.id);
            const left = await ctx.db.select().from(sessions).where(eq(sessions.userId, author.id));
            expect(left).toHaveLength(0);
        });
    });

    it('answers 409, not 500, when two requests race to create the same name', async () => {
        const create = () =>
            call('POST', '/admin/projects', admin, { name: 'Raced project' });
        const statuses = (await Promise.all([create(), create(), create()]))
            .map((r) => r.statusCode)
            .sort();
        expect(statuses).toEqual([201, 409, 409]);
        const user = () =>
            call('POST', '/admin/users', admin, {
                email: 'raced@example.com',
                password: 'Password-123!',
            });
        const users = (await Promise.all([user(), user()]))
            .map((r) => r.statusCode)
            .sort();
        expect(users).toEqual([201, 409]);
    });
});
