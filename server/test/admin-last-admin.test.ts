import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { ADMIN_SET_LOCK } from '../src/admin/routes.js';
import { users } from '../src/db/schema.js';
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

describe('two admins acting at once', () => {
    let ctx: TestCtx;
    let a: TestUser;
    let b: TestUser;

    beforeEach(async () => {
        ctx = await createTestApp();
        a = await registerUser(ctx.app, 'a@example.com');
        b = await registerUser(ctx.app, 'b@example.com');
        const res = await ctx.app.inject({
            method: 'PATCH',
            url: `/admin/users/${b.id}`,
            headers: as(a),
            payload: { isAdmin: true, adminPassword: 'Password-123!' },
        });
        expect(res.statusCode).toBe(200);
    });
    afterEach(() => ctx.close());

    const activeAdmins = async () =>
        (await ctx.db.select().from(users)).filter(
            (u) => u.isAdmin && u.isActive
        ).length;

    it('never ends with no admin when they demote each other', async () => {
        const [r1, r2] = await Promise.all([
            ctx.app.inject({
                method: 'PATCH',
                url: `/admin/users/${b.id}`,
                headers: as(a),
                payload: { isAdmin: false },
            }),
            ctx.app.inject({
                method: 'PATCH',
                url: `/admin/users/${a.id}`,
                headers: as(b),
                payload: { isAdmin: false },
            }),
        ]);
        // one wins; the other is refused (or no longer an admin by then)
        const codes = [r1.statusCode, r2.statusCode];
        expect(codes.filter((c) => c === 200)).toHaveLength(1);
        expect(await activeAdmins()).toBe(1);
    });

    it('never ends with no admin when they delete each other', async () => {
        const [r1, r2] = await Promise.all([
            ctx.app.inject({
                method: 'DELETE',
                url: `/admin/users/${b.id}`,
                headers: as(a),
            }),
            ctx.app.inject({
                method: 'DELETE',
                url: `/admin/users/${a.id}`,
                headers: as(b),
            }),
        ]);
        const codes = [r1.statusCode, r2.statusCode];
        expect(codes.filter((c) => c === 204)).toHaveLength(1);
        expect(await activeAdmins()).toBe(1);
    });

    it.each(['demote', 'delete'] as const)(
        'waits for the admin-set lock before a %s',
        async (kind) => {
            let settled = false;
            let pending!: Promise<{ statusCode: number }>;
            await ctx.db.transaction(async (tx) => {
                await tx.execute(
                    sql`select pg_advisory_xact_lock(${ADMIN_SET_LOCK})`
                );
                pending = (
                    kind === 'demote'
                        ? ctx.app.inject({
                              method: 'PATCH',
                              url: `/admin/users/${b.id}`,
                              headers: as(a),
                              payload: { isAdmin: false },
                          })
                        : ctx.app.inject({
                              method: 'DELETE',
                              url: `/admin/users/${b.id}`,
                              headers: as(a),
                          })
                ).then((r) => {
                    settled = true;
                    return r;
                });
                await new Promise((r) => setTimeout(r, 400));
                // someone else is changing the admin set: this request waits
                expect(settled).toBe(false);
            });
            expect((await pending).statusCode).toBeLessThan(300);
            expect(await activeAdmins()).toBe(1);
        }
    );
});
