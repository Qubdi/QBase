import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog } from '../src/db/schema.js';
import {
    as,
    createDiagram,
    createTestApp,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

describe('members', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    let bob: TestUser;
    let carol: TestUser;
    let stranger: TestUser;
    let diagramId: string;

    const add = (who: TestUser, email: string, role = 'viewer') =>
        ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${diagramId}/members`,
            headers: as(who),
            payload: { email, role },
        });

    beforeAll(async () => {
        ctx = await createTestApp();
        owner = await registerUser(ctx.app, 'owner@example.com');
        bob = await registerUser(ctx.app, 'bob@example.com');
        carol = await registerUser(ctx.app, 'carol@example.com');
        stranger = await registerUser(ctx.app, 'stranger@example.com');
        diagramId = await createDiagram(ctx.app, owner);
    });
    afterAll(() => ctx.close());

    it('lets the owner add a member by email and grants access', async () => {
        const res = await add(owner, 'BOB@example.com', 'viewer');
        expect(res.statusCode).toBe(201);
        expect(res.json()).toMatchObject({ email: 'bob@example.com', role: 'viewer' });
        const get = await ctx.app.inject({
            url: `/diagrams/${diagramId}`,
            headers: as(bob),
        });
        expect(get.statusCode).toBe(200);
    });

    it('rejects duplicates, unknown users and invalid roles', async () => {
        expect((await add(owner, 'bob@example.com')).statusCode).toBe(409);
        expect((await add(owner, 'ghost@example.com')).statusCode).toBe(404);
        expect((await add(owner, 'carol@example.com', 'owner')).statusCode).toBe(400);
    });

    it('lists members for any member and hides them from strangers', async () => {
        const ok = await ctx.app.inject({
            url: `/diagrams/${diagramId}/members`,
            headers: as(bob),
        });
        expect(ok.statusCode).toBe(200);
        expect(ok.json().map((m: { role: string }) => m.role).sort()).toEqual([
            'owner',
            'viewer',
        ]);
        const no = await ctx.app.inject({
            url: `/diagrams/${diagramId}/members`,
            headers: as(stranger),
        });
        expect(no.statusCode).toBe(404);
    });

    it('only lets the owner manage members', async () => {
        expect((await add(bob, 'carol@example.com')).statusCode).toBe(403);
        expect((await add(stranger, 'carol@example.com')).statusCode).toBe(404);

        const patch = await ctx.app.inject({
            method: 'PATCH',
            url: `/diagrams/${diagramId}/members/${bob.id}`,
            headers: as(bob),
            payload: { role: 'editor' },
        });
        expect(patch.statusCode).toBe(403);
        const del = await ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${diagramId}/members/${bob.id}`,
            headers: as(bob),
        });
        expect(del.statusCode).toBe(403);
    });

    it('changes a role and the new permissions apply immediately', async () => {
        const patch = await ctx.app.inject({
            method: 'PATCH',
            url: `/diagrams/${diagramId}/members/${bob.id}`,
            headers: as(owner),
            payload: { role: 'editor' },
        });
        expect(patch.statusCode).toBe(200);
        const put = await ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${diagramId}`,
            headers: as(bob),
            payload: { title: 'Bob edit' },
        });
        expect(put.statusCode).toBe(200);
    });

    it('protects the owner membership', async () => {
        const patch = await ctx.app.inject({
            method: 'PATCH',
            url: `/diagrams/${diagramId}/members/${owner.id}`,
            headers: as(owner),
            payload: { role: 'viewer' },
        });
        expect(patch.statusCode).toBe(400);
        const del = await ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${diagramId}/members/${owner.id}`,
            headers: as(owner),
        });
        expect(del.statusCode).toBe(400);
    });

    it('returns 404 when changing or removing a non-member', async () => {
        const patch = await ctx.app.inject({
            method: 'PATCH',
            url: `/diagrams/${diagramId}/members/${carol.id}`,
            headers: as(owner),
            payload: { role: 'viewer' },
        });
        expect(patch.statusCode).toBe(404);
        const del = await ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${diagramId}/members/${carol.id}`,
            headers: as(owner),
        });
        expect(del.statusCode).toBe(404);
    });

    it('removes a member and revokes access', async () => {
        const del = await ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${diagramId}/members/${bob.id}`,
            headers: as(owner),
        });
        expect(del.statusCode).toBe(204);
        const get = await ctx.app.inject({
            url: `/diagrams/${diagramId}`,
            headers: as(bob),
        });
        expect(get.statusCode).toBe(404);
    });

    it('requires login', async () => {
        const res = await ctx.app.inject({
            url: `/diagrams/${diagramId}/members`,
        });
        expect(res.statusCode).toBe(401);
    });

    it('audits share and role changes', async () => {
        const actions = (await ctx.db.select().from(auditLog))
            .filter((r) => r.diagramId === diagramId)
            .map((r) => r.action);
        expect(actions).toEqual(
            expect.arrayContaining([
                'member.add',
                'member.role_change',
                'member.remove',
            ])
        );
    });
});
