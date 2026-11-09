import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diagrams, users } from '../src/db/schema.js';
import { as, createDiagram, createTestApp, registerUser, type TestCtx, type TestUser } from './helpers.js';

describe('a change and its audit row are one transaction', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let other: TestUser;

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
        other = await registerUser(ctx.app, 'other@example.com');
    });
    afterAll(() => ctx.close());

    /** Makes every audit insert fail, for the length of one request. */
    const withBrokenAudit = async <T>(run: () => Promise<T>): Promise<T> => {
        await ctx.db.execute(sql`ALTER TABLE audit_log RENAME TO audit_log_away`);
        try {
            return await run();
        } finally {
            await ctx.db.execute(sql`ALTER TABLE audit_log_away RENAME TO audit_log`);
        }
    };

    it('does not delete a diagram whose log row could not be written', async () => {
        const id = await createDiagram(ctx.app, admin, 'Keep me');
        const res = await withBrokenAudit(() =>
            ctx.app.inject({ method: 'DELETE', url: `/diagrams/${id}`, headers: as(admin) })
        );
        expect(res.statusCode).toBe(500);
        expect(await ctx.db.select().from(diagrams).where(eq(diagrams.id, id))).toHaveLength(1);
    });

    it('does not delete an account whose log row could not be written', async () => {
        const res = await withBrokenAudit(() =>
            ctx.app.inject({ method: 'DELETE', url: `/admin/users/${other.id}`, headers: as(admin) })
        );
        expect(res.statusCode).toBe(500);
        expect(await ctx.db.select().from(users).where(eq(users.id, other.id))).toHaveLength(1);
    });

    it('does not change accounts in bulk when the log rows could not be written', async () => {
        const res = await withBrokenAudit(() =>
            ctx.app.inject({
                method: 'POST',
                url: '/admin/users/bulk',
                headers: as(admin),
                payload: { action: 'disable', ids: [other.id] },
            })
        );
        expect(res.statusCode).toBe(500);
        const [row] = await ctx.db.select().from(users).where(eq(users.id, other.id));
        expect(row.isActive).toBe(true);
    });
});
