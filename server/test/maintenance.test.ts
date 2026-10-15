import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, sessions } from '../src/db/schema.js';
import { purgeAuditLog, purgeExpiredSessions } from '../src/maintenance.js';
import { createTestApp, registerUser, type TestCtx } from './helpers.js';

describe('maintenance', () => {
    let ctx: TestCtx;
    let userId: string;
    const now = new Date('2026-06-01T00:00:00Z');
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

    beforeAll(async () => {
        ctx = await createTestApp();
        userId = (await registerUser(ctx.app, 'a@example.com')).id;
    });
    afterAll(() => ctx.close());

    it('deletes expired sessions and keeps live ones', async () => {
        await ctx.db.delete(sessions);
        await ctx.db.insert(sessions).values([
            { id: 'expired', userId, expiresAt: daysAgo(1) },
            { id: 'live', userId, expiresAt: new Date(now.getTime() + 1000) },
        ]);
        expect(await purgeExpiredSessions(ctx.db, now)).toBe(1);
        const left = await ctx.db.select().from(sessions);
        expect(left.map((s) => s.id)).toEqual(['live']);
    });

    it('deletes audit rows past the retention and keeps newer ones', async () => {
        await ctx.db.delete(auditLog);
        await ctx.db.insert(auditLog).values([
            { userId, action: 'user.register', at: daysAgo(400) },
            { userId, action: 'diagram.create', at: daysAgo(10) },
        ]);
        expect(await purgeAuditLog(ctx.db, 365, now)).toBe(1);
        const left = await ctx.db.select().from(auditLog);
        expect(left.map((r) => r.action)).toEqual(['diagram.create']);
    });

    it('keeps every audit row when retention is 0', async () => {
        await ctx.db.insert(auditLog).values({
            userId,
            action: 'user.register',
            at: daysAgo(5000),
        });
        expect(await purgeAuditLog(ctx.db, 0, now)).toBe(0);
    });
});
