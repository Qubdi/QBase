import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { projectMembers, projects, shareLinks, users } from '../src/db/schema.js';
import {
    as,
    createDiagram,
    createTestApp,
    grant,
    projectFor,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// Every route under /admin, with a body that would do something if it were
// let through. The ids are filled in once the fixtures exist.
const routes = (ids: {
    user: string;
    project: string;
    diagram: string;
    link: string;
}): Array<[Method, string, object?]> => [
    ['GET', '/admin/stats'],
    ['GET', '/admin/audit'],
    ['GET', '/admin/audit/export'],
    ['GET', '/admin/users'],
    ['POST', '/admin/users', { email: 'planted@example.com', password: 'Password-123!' }],
    ['PATCH', `/admin/users/${ids.user}`, { isAdmin: true }],
    ['DELETE', `/admin/users/${ids.user}`],
    ['POST', '/admin/users/bulk', { action: 'disable', ids: [ids.user] }],
    ['POST', `/admin/users/${ids.user}/mfa/reset`, {}],
    ['GET', `/admin/users/${ids.user}/sessions`],
    ['DELETE', `/admin/users/${ids.user}/sessions`],
    ['GET', '/admin/diagrams'],
    ['GET', `/admin/diagrams/${ids.diagram}/share-links`],
    ['DELETE', `/admin/diagrams/${ids.diagram}/share-links/${ids.link}`],
    ['GET', '/admin/projects'],
    ['POST', '/admin/projects', { name: 'Planted' }],
    ['PATCH', `/admin/projects/${ids.project}`, { name: 'Renamed' }],
    ['DELETE', `/admin/projects/${ids.project}`],
    ['GET', `/admin/projects/${ids.project}/members`],
    ['PUT', `/admin/projects/${ids.project}/members/${ids.user}`, { role: 'editor' }],
    ['DELETE', `/admin/projects/${ids.project}/members/${ids.user}`],
];

describe('the admin API, route by route', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let editor: TestUser;
    let viewer: TestUser;
    let loner: TestUser;
    let projectId: string;
    let diagramId: string;
    let linkId: string;

    const call = (who: TestUser | null, method: Method, url: string, payload?: object) =>
        ctx.app.inject({
            method,
            url,
            headers: who ? as(who) : undefined,
            ...(payload !== undefined ? { payload } : {}),
        });

    /** What the refused calls above could have changed. */
    const snapshot = async () => ({
        users: await ctx.db
            .select({ id: users.id, isAdmin: users.isAdmin, isActive: users.isActive })
            .from(users)
            .orderBy(users.email),
        projects: await ctx.db
            .select({ id: projects.id, name: projects.name })
            .from(projects)
            .orderBy(projects.name),
        members: await ctx.db
            .select()
            .from(projectMembers)
            .orderBy(projectMembers.userId),
        links: await ctx.db
            .select({ id: shareLinks.id, revokedAt: shareLinks.revokedAt })
            .from(shareLinks),
    });

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
        editor = await registerUser(ctx.app, 'editor@example.com');
        viewer = await registerUser(ctx.app, 'viewer@example.com');
        loner = await registerUser(ctx.app, 'loner@example.com');
        projectId = await projectFor(ctx.app);
        diagramId = await createDiagram(ctx.app, editor);
        await grant(ctx.app, viewer, 'viewer');
        const link = await call(editor, 'POST', `/diagrams/${diagramId}/share-links`, {});
        linkId = link.json().id;
    });
    afterAll(() => ctx.close());

    it('answers 401 to every admin route without a session', async () => {
        for (const [method, url, payload] of routes({
            user: loner.id,
            project: projectId,
            diagram: diagramId,
            link: linkId,
        })) {
            const res = await call(null, method, url, payload);
            expect(res.statusCode, `${method} ${url}`).toBe(401);
        }
    });

    it('answers 404 to every admin route for non-admins, and changes nothing', async () => {
        const before = await snapshot();
        for (const who of [editor, viewer, loner]) {
            // each targets someone else, and themselves
            for (const target of [loner.id, who.id]) {
                for (const [method, url, payload] of routes({
                    user: target,
                    project: projectId,
                    diagram: diagramId,
                    link: linkId,
                })) {
                    const res = await call(who, method, url, payload);
                    expect(res.statusCode, `${who.email}: ${method} ${url}`).toBe(404);
                    // the same answer as a route that does not exist: nothing says it is there
                    expect(res.json()).toEqual({ error: 'not_found' });
                }
            }
        }
        expect(await snapshot()).toEqual(before);
    });

    it('drops admin rights at once when an admin is demoted, session and all', async () => {
        const deputy = await registerUser(ctx.app, 'deputy@example.com');
        const promote = await call(admin, 'PATCH', `/admin/users/${deputy.id}`, {
            isAdmin: true,
            adminPassword: 'Password-123!',
        });
        expect(promote.statusCode).toBe(200);
        expect((await call(deputy, 'GET', '/admin/users')).statusCode).toBe(200);
        // as an admin, the deputy is an owner of every diagram
        expect((await call(deputy, 'GET', `/diagrams/${diagramId}`)).json().role).toBe('owner');

        const demote = await call(admin, 'PATCH', `/admin/users/${deputy.id}`, { isAdmin: false });
        expect(demote.statusCode).toBe(200);
        // the same cookie, no new sign-in
        expect((await call(deputy, 'GET', '/admin/users')).statusCode).toBe(404);
        expect((await call(deputy, 'GET', `/diagrams/${diagramId}`)).statusCode).toBe(404);
        const me = await call(deputy, 'GET', '/auth/me');
        expect(me.json().isAdmin).toBe(false);
    });

    describe('what an admin is refused', () => {
        it('only grants the editor and viewer roles', async () => {
            for (const role of ['owner', 'admin', 'EDITOR', '']) {
                const res = await call(
                    admin,
                    'PUT',
                    `/admin/projects/${projectId}/members/${loner.id}`,
                    { role }
                );
                expect(res.statusCode, role).toBe(400);
            }
            const rows = await ctx.db
                .select()
                .from(projectMembers)
                .where(eq(projectMembers.userId, loner.id));
            expect(rows).toEqual([]);
        });

        it('answers 404 for a member of a project or user that does not exist', async () => {
            const ghost = randomUUID();
            const noProject = await call(admin, 'PUT', `/admin/projects/${ghost}/members/${loner.id}`, {
                role: 'viewer',
            });
            expect(noProject.statusCode).toBe(404);
            const noUser = await call(admin, 'PUT', `/admin/projects/${projectId}/members/${ghost}`, {
                role: 'viewer',
            });
            expect(noUser.statusCode).toBe(404);
            const notMember = await call(
                admin,
                'DELETE',
                `/admin/projects/${projectId}/members/${loner.id}`
            );
            expect(notMember.statusCode).toBe(404);
        });

        it('answers 404 for a user or project that does not exist', async () => {
            const ghost = randomUUID();
            expect((await call(admin, 'DELETE', `/admin/users/${ghost}`)).statusCode).toBe(404);
            expect(
                (await call(admin, 'PATCH', `/admin/projects/${ghost}`, { description: 'x' }))
                    .statusCode
            ).toBe(404);
            expect((await call(admin, 'GET', `/admin/projects/${ghost}/members`)).statusCode).toBe(
                404
            );
        });

        it('refuses a project name that cannot be a URL, and an empty change', async () => {
            const bad = await call(admin, 'PATCH', `/admin/projects/${projectId}`, { name: '///' });
            expect(bad.statusCode).toBe(400);
            const empty = await call(admin, 'PATCH', `/admin/projects/${projectId}`, {});
            expect(empty.statusCode).toBe(400);
            const [row] = await ctx.db.select().from(projects).where(eq(projects.id, projectId));
            expect(row.name).toBe('Test project');
        });

        it('answers 400, not 500, to ids that are not uuids', async () => {
            for (const [method, url, payload] of [
                ['PATCH', '/admin/users/42', { isAdmin: true }],
                ['DELETE', '/admin/users/not-a-uuid'],
                ['GET', '/admin/projects/1/members'],
                ['PUT', `/admin/projects/${projectId}/members/x`, { role: 'viewer' }],
                ['DELETE', `/admin/diagrams/${diagramId}/share-links/zzz`],
            ] as Array<[Method, string, object?]>) {
                const res = await call(admin, method, url, payload);
                expect(res.statusCode, `${method} ${url}`).toBe(400);
                expect(res.json().error).toBe('invalid_request');
            }
        });
    });
});
