import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
    auditLog,
    diagrams,
    driftReports,
    projects,
    sessions,
} from '../src/db/schema.js';
import {
    pruneDriftReports,
    purgeAuditLog,
    purgeExpiredSessions,
} from '../src/maintenance.js';
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

    it('deletes a backlog across several batches and counts every row', async () => {
        await ctx.db.delete(auditLog);
        await ctx.db.insert(auditLog).values([
            ...Array.from({ length: 7 }, () => ({
                userId,
                action: 'user.register' as const,
                at: daysAgo(400),
            })),
            { userId, action: 'diagram.create' as const, at: daysAgo(1) },
        ]);
        expect(await purgeAuditLog(ctx.db, 365, now, 3)).toBe(7);
        expect(await ctx.db.select().from(auditLog)).toHaveLength(1);
    });

    it('keeps every audit row when retention is 0', async () => {
        await ctx.db.insert(auditLog).values({
            userId,
            action: 'user.register',
            at: daysAgo(5000),
        });
        expect(await purgeAuditLog(ctx.db, 0, now)).toBe(0);
    });

    it('keeps the newest drift reports of each diagram and prunes the rest', async () => {
        const [project] = await ctx.db
            .insert(projects)
            .values({ name: 'Maintenance', slug: 'maintenance' })
            .returning({ id: projects.id });
        const [{ id: a }, { id: b }] = await ctx.db
            .insert(diagrams)
            .values([
                { projectId: project.id, ownerId: userId, title: 'A', content: {} },
                { projectId: project.id, ownerId: userId, title: 'B', content: {} },
            ])
            .returning({ id: diagrams.id });
        const report = (diagramId: string, n: number) => ({
            diagramId,
            runAt: daysAgo(n),
            status: 'clean' as const,
            trigger: 'manual' as const,
        });
        await ctx.db
            .insert(driftReports)
            .values([1, 2, 3, 4].map((n) => report(a, n)).concat([report(b, 1)]));
        expect(await pruneDriftReports(ctx.db, 2)).toBe(2);
        const left = await ctx.db
            .select({ runAt: driftReports.runAt })
            .from(driftReports)
            .where(eq(driftReports.diagramId, a));
        expect(left.map((r) => r.runAt.getTime()).sort()).toEqual(
            [daysAgo(2).getTime(), daysAgo(1).getTime()].sort()
        );
        const other = await ctx.db
            .select()
            .from(driftReports)
            .where(and(eq(driftReports.diagramId, b)));
        expect(other).toHaveLength(1);
    });

    it('keeps every drift report when the limit is 0', async () => {
        expect(await pruneDriftReports(ctx.db, 0)).toBe(0);
    });
});
