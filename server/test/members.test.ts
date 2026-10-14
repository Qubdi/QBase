import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    as,
    createDiagram,
    createTestApp,
    grant,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

// Access to a diagram comes from its project and is granted by an admin (see
// admin-projects.test.ts). The diagram only exposes a read-only member list.
describe('diagram members (read-only)', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let bob: TestUser;
    let carol: TestUser;
    let stranger: TestUser;
    let diagramId: string;

    const list = (who: TestUser) =>
        ctx.app.inject({
            url: `/diagrams/${diagramId}/members`,
            headers: as(who),
        });

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
        bob = await registerUser(ctx.app, 'bob@example.com');
        carol = await registerUser(ctx.app, 'carol@example.com');
        stranger = await registerUser(ctx.app, 'stranger@example.com');
        diagramId = await createDiagram(ctx.app, admin);
        await grant(ctx.app, bob, 'viewer');
        await grant(ctx.app, carol, 'editor');
    });
    afterAll(() => ctx.close());

    it('lists the project members with their roles to any member', async () => {
        for (const who of [admin, bob, carol]) {
            const res = await list(who);
            expect(res.statusCode).toBe(200);
            const roles = Object.fromEntries(
                res.json().map((m: { email: string; role: string }) => [m.email, m.role])
            );
            expect(roles).toEqual({
                'bob@example.com': 'viewer',
                'carol@example.com': 'editor',
            });
        }
    });

    it('hides the list from strangers and anonymous callers', async () => {
        expect((await list(stranger)).statusCode).toBe(404);
        const anon = await ctx.app.inject({ url: `/diagrams/${diagramId}/members` });
        expect(anon.statusCode).toBe(401);
    });

    it('no longer lets anyone add, change or remove diagram members', async () => {
        const add = await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${diagramId}/members`,
            headers: as(admin),
            payload: { email: stranger.email, role: 'viewer' },
        });
        expect(add.statusCode).toBe(404);
        const patch = await ctx.app.inject({
            method: 'PATCH',
            url: `/diagrams/${diagramId}/members/${bob.id}`,
            headers: as(admin),
            payload: { role: 'editor' },
        });
        expect(patch.statusCode).toBe(404);
        const del = await ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${diagramId}/members/${bob.id}`,
            headers: as(admin),
        });
        expect(del.statusCode).toBe(404);
        // and nothing changed
        expect((await list(admin)).json()).toHaveLength(2);
    });
});
