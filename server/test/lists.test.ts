import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    as,
    createTestApp,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

describe('paged and searchable lists', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let member: TestUser;
    let stranger: TestUser;
    const projectIds: Record<string, string> = {};

    const get = (url: string, who?: TestUser) =>
        ctx.app.inject({ url, headers: who ? as(who) : undefined });

    const putMember = (projectId: string, userId: string, role: string) =>
        ctx.app.inject({
            method: 'PUT',
            url: `/admin/projects/${projectId}/members/${userId}`,
            headers: as(admin),
            payload: { role },
        });

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
        member = await registerUser(ctx.app, 'member@example.com');
        stranger = await registerUser(ctx.app, 'stranger@example.com');
        for (const n of ['ann', 'bob', 'cara', 'dave', 'eve']) {
            await registerUser(ctx.app, `${n}@corp.example.com`);
        }
        await registerUser(ctx.app, 'under_score@sale.example.com');

        for (const name of [
            'Alpha',
            'Beta Billing',
            'Gamma',
            'Delta',
            'Epsilon',
            'Zeta 100%',
        ]) {
            const res = await ctx.app.inject({
                method: 'POST',
                url: '/admin/projects',
                headers: as(admin),
                payload: { name },
            });
            projectIds[name] = res.json().id;
        }
        // the member belongs to two projects only
        await putMember(projectIds['Alpha'], member.id, 'editor');
        await putMember(projectIds['Beta Billing'], member.id, 'viewer');
        // two diagrams in one project
        await ctx.app.inject({
            method: 'POST',
            url: '/diagrams',
            headers: as(admin),
            payload: {
                title: 'One',
                content: { id: 'a', name: 'One', databaseType: 'postgresql' },
                projectId: projectIds['Alpha'],
            },
        });
        await ctx.app.inject({
            method: 'POST',
            url: '/diagrams',
            headers: as(admin),
            payload: {
                title: 'Two',
                content: { id: 'b', name: 'Two', databaseType: 'postgresql' },
                projectId: projectIds['Alpha'],
            },
        });
    });
    afterAll(() => ctx.close());

    describe('GET /admin/users', () => {
        it('returns a page with the total and the paging used', async () => {
            const res = await get('/admin/users?limit=4', admin);
            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(body.items).toHaveLength(4);
            expect(body.total).toBe(9);
            expect(body.page).toBe(1);
            expect(body.limit).toBe(4);
        });

        it('walks every user exactly once across pages, in a stable order', async () => {
            const seen: string[] = [];
            for (const page of [1, 2, 3]) {
                const res = await get(`/admin/users?limit=4&page=${page}`, admin);
                seen.push(...res.json().items.map((u: { id: string }) => u.id));
            }
            expect(seen).toHaveLength(9);
            expect(new Set(seen).size).toBe(9);
            expect(seen[0]).toBe(admin.id);
        });

        it('returns no items, but the real total, past the last page', async () => {
            const res = await get('/admin/users?limit=4&page=9', admin);
            expect(res.json().items).toEqual([]);
            expect(res.json().total).toBe(9);
        });

        it('searches emails, ignoring case, and counts only the matches', async () => {
            const res = await get('/admin/users?q=CORP', admin);
            expect(res.json().total).toBe(5);
            expect(
                res.json().items.every((u: { email: string }) => u.email.includes('corp'))
            ).toBe(true);
            expect((await get('/admin/users?q=ann', admin)).json().total).toBe(1);
            expect((await get('/admin/users?q=nobody', admin)).json().total).toBe(0);
        });

        it('searches within a page window: page 2 of a search', async () => {
            const res = await get('/admin/users?q=corp&limit=2&page=3', admin);
            expect(res.json().items).toHaveLength(1);
            expect(res.json().total).toBe(5);
        });

        it('treats % and _ in the search as plain characters', async () => {
            // unescaped, "%" would match everyone and "_" any single character
            expect((await get('/admin/users?q=%25', admin)).json().total).toBe(0);
            expect((await get('/admin/users?q=_', admin)).json().total).toBe(1);
            expect((await get('/admin/users?q=r_s', admin)).json().total).toBe(1);
            expect((await get('/admin/users?q=rXs', admin)).json().total).toBe(0);
        });

        it('ignores a blank search', async () => {
            expect((await get('/admin/users?q=%20%20', admin)).json().total).toBe(9);
        });

        it('rejects values outside the allowed range', async () => {
            for (const qs of ['page=0', 'limit=0', 'limit=101', 'page=x', 'limit=2.5']) {
                const res = await get(`/admin/users?${qs}`, admin);
                expect(res.statusCode, qs).toBe(400);
            }
        });

        it('stays admin-only', async () => {
            expect((await get('/admin/users', member)).statusCode).toBe(404);
            expect((await get('/admin/users')).statusCode).toBe(401);
        });
    });

    describe('GET /admin/projects', () => {
        it('pages the projects by name', async () => {
            const first = (await get('/admin/projects?limit=4', admin)).json();
            expect(first.total).toBe(6);
            expect(first.items.map((p: { name: string }) => p.name)).toEqual([
                'Alpha',
                'Beta Billing',
                'Delta',
                'Epsilon',
            ]);
            const second = (await get('/admin/projects?limit=4&page=2', admin)).json();
            expect(second.items.map((p: { name: string }) => p.name)).toEqual([
                'Gamma',
                'Zeta 100%',
            ]);
        });

        it('searches the name and the web address', async () => {
            expect((await get('/admin/projects?q=billing', admin)).json().total).toBe(1);
            expect((await get('/admin/projects?q=Beta-Bill', admin)).json().total).toBe(1);
            expect((await get('/admin/projects?q=%25', admin)).json().total).toBe(1);
            // every name or address except "Epsilon" contains an "a"
            expect((await get('/admin/projects?q=a', admin)).json().total).toBe(5);
        });

        it('includes member and diagram counts', async () => {
            const alpha = (await get('/admin/projects?q=alpha', admin))
                .json()
                .items.find((p: { name: string }) => p.name === 'Alpha');
            expect(alpha.members).toBe(1);
            expect(alpha.diagrams).toBe(2);
        });
    });

    describe('GET /projects (what a signed-in user can work in)', () => {
        it('shows a member only the projects they were assigned', async () => {
            const res = (await get('/projects', member)).json();
            expect(res.total).toBe(2);
            expect(res.items.map((p: { name: string }) => p.name)).toEqual([
                'Alpha',
                'Beta Billing',
            ]);
            expect(res.items.map((p: { role: string }) => p.role)).toEqual([
                'editor',
                'viewer',
            ]);
        });

        it('shows a user with no assignments nothing', async () => {
            const res = (await get('/projects', stranger)).json();
            expect(res.items).toEqual([]);
            expect(res.total).toBe(0);
        });

        it('never leaks other projects through search or paging', async () => {
            // "Gamma" exists, but this member is not in it
            expect((await get('/projects?q=gamma', member)).json().total).toBe(0);
            expect((await get('/projects?q=a', member)).json().total).toBe(2);
            const paged = (await get('/projects?limit=1&page=2', member)).json();
            expect(paged.items.map((p: { name: string }) => p.name)).toEqual([
                'Beta Billing',
            ]);
            expect(paged.total).toBe(2);
            expect((await get('/projects?page=3&limit=1', member)).json().items).toEqual(
                []
            );
        });

        it('shows an admin every project, paged and searchable', async () => {
            const res = (await get('/projects?limit=3', admin)).json();
            expect(res.total).toBe(6);
            expect(res.items).toHaveLength(3);
            expect(res.items.every((p: { role: string }) => p.role === 'owner')).toBe(true);
            expect((await get('/projects?q=zeta', admin)).json().total).toBe(1);
        });

        it('reports how many diagrams each project holds', async () => {
            const alpha = (await get('/projects?q=alpha', member))
                .json()
                .items.find((p: { name: string }) => p.name === 'Alpha');
            expect(alpha.diagramCount).toBe(2);
            const beta = (await get('/projects?q=beta', member))
                .json()
                .items.find((p: { name: string }) => p.name === 'Beta Billing');
            expect(beta.diagramCount).toBe(0);
        });

        it('requires a session', async () => {
            expect((await get('/projects')).statusCode).toBe(401);
        });
    });

    describe('GET /projects/:ref', () => {
        it('finds a project by its web address, ignoring case', async () => {
            for (const ref of ['Alpha', 'alpha', 'ALPHA']) {
                const res = await get(`/projects/${ref}`, member);
                expect(res.statusCode, ref).toBe(200);
                expect(res.json()).toMatchObject({
                    id: projectIds['Alpha'],
                    slug: 'Alpha',
                    role: 'editor',
                });
            }
        });

        it('finds a project by id', async () => {
            const res = await get(`/projects/${projectIds['Beta Billing']}`, member);
            expect(res.json()).toMatchObject({ slug: 'Beta-Billing', role: 'viewer' });
        });

        it('hides projects the user is not in, exactly like missing ones', async () => {
            expect((await get('/projects/Gamma', member)).statusCode).toBe(404);
            expect((await get(`/projects/${projectIds['Gamma']}`, member)).statusCode).toBe(404);
            expect((await get('/projects/does-not-exist', member)).statusCode).toBe(404);
            expect((await get('/projects/Alpha', stranger)).statusCode).toBe(404);
        });

        it('lets an admin open any project as its owner', async () => {
            const res = await get('/projects/Gamma', admin);
            expect(res.statusCode).toBe(200);
            expect(res.json().role).toBe('owner');
        });

        it('requires a session', async () => {
            expect((await get('/projects/Alpha')).statusCode).toBe(401);
        });
    });
});
