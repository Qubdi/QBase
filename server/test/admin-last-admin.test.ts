import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createTestApp, registerUser, type TestCtx, type TestUser } from './helpers.js';

describe('protecting the last admin', () => {
    let ctx: TestCtx;
    let only: TestUser;
    beforeAll(async () => {
        ctx = await createTestApp();
        only = await registerUser(ctx.app, 'sole@example.com');
    });
    afterAll(() => ctx.close());

    it('refuses to demote the only admin', async () => {
        const res = await ctx.app.inject({
            method: 'PATCH',
            url: `/admin/users/${only.id}`,
            headers: as(only),
            payload: { isAdmin: false },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('last_admin');
    });

    it('refuses to let an admin delete themselves', async () => {
        const res = await ctx.app.inject({
            method: 'DELETE',
            url: `/admin/users/${only.id}`,
            headers: as(only),
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('cannot_delete_self');
    });
});
