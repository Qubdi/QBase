import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
    auditLog,
    diagramLocks,
    diagrams,
    driftReports,
    mfaChallenges,
    projects,
    sessions,
    shareLinks,
} from '../src/db/schema.js';
import {
    pruneDriftReports,
    purgeDeadLinks,
    purgeExpiredLocks,
    purgeExpiredMfaChallenges,
    purgeAuditLog,
    purgeExpiredSessions,
    runMaintenance,
    startMaintenance,
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

    it('carries on with the later steps when one of them fails, and says which', async () => {
        await ctx.db.delete(mfaChallenges);
        await ctx.db.insert(mfaChallenges).values({
            id: 'stale',
            userId,
            expiresAt: daysAgo(1),
        });
        // the sessions step is the first one, and it fails
        const flaky = new Proxy(ctx.db, {
            get(target, prop, receiver) {
                if (prop === 'delete') {
                    return (table: unknown) => {
                        if (table === sessions) throw new Error('disk full');
                        return target.delete(table as typeof sessions);
                    };
                }
                return Reflect.get(target, prop, receiver);
            },
        });
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            const result = await runMaintenance(
                flaky,
                {
                    auditRetentionDays: 365,
                    snapshotKeep: 200,
                    driftReportKeep: 50,
                    deadLinkKeepDays: 30,
                },
                now
            );
            expect(result.failed).toEqual(['sessions']);
            expect(result.sessions).toBe(0);
            // a step after the failed one still ran
            expect(result.mfaChallenges).toBe(1);
            expect(await ctx.db.select().from(mfaChallenges)).toHaveLength(0);
            expect(log).toHaveBeenCalledWith(
                expect.stringContaining('"sessions" failed'),
                expect.any(Error)
            );
        } finally {
            log.mockRestore();
        }
    });

    it('reports no failures when every step works', async () => {
        const result = await runMaintenance(
            ctx.db,
            {
                auditRetentionDays: 365,
                snapshotKeep: 200,
                driftReportKeep: 50,
                deadLinkKeepDays: 30,
            },
            now
        );
        expect(result.failed).toEqual([]);
    });

    it('deletes expired second-step challenges and keeps live ones', async () => {
        await ctx.db.delete(mfaChallenges);
        await ctx.db.insert(mfaChallenges).values([
            { id: 'old', userId, expiresAt: daysAgo(1) },
            { id: 'new', userId, expiresAt: new Date(now.getTime() + 1000) },
        ]);
        expect(await purgeExpiredMfaChallenges(ctx.db, now)).toBe(1);
        const left = await ctx.db.select().from(mfaChallenges);
        expect(left.map((c) => c.id)).toEqual(['new']);
    });

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

    describe('locks and dead share links', () => {
        let diagramId: string;
        beforeAll(async () => {
            const [project] = await ctx.db
                .insert(projects)
                .values({ name: 'Dead links', slug: 'dead-links' })
                .returning({ id: projects.id });
            [{ id: diagramId }] = await ctx.db
                .insert(diagrams)
                .values({
                    projectId: project.id,
                    ownerId: userId,
                    title: 'Links',
                    content: {},
                })
                .returning({ id: diagrams.id });
        });

        it('deletes edit locks that were not renewed', async () => {
            await ctx.db.delete(diagramLocks);
            await ctx.db.insert(diagramLocks).values({
                diagramId,
                userId,
                editorId: 'tab',
                expiresAt: daysAgo(1),
            });
            expect(await purgeExpiredLocks(ctx.db, now)).toBe(1);
            await ctx.db.insert(diagramLocks).values({
                diagramId,
                userId,
                editorId: 'tab',
                expiresAt: new Date(now.getTime() + 60_000),
            });
            expect(await purgeExpiredLocks(ctx.db, now)).toBe(0);
        });

        it('deletes links revoked or expired long ago and keeps the rest', async () => {
            const link = (name: string, over: object) => ({
                diagramId,
                tokenHash: `hash-${name}`,
                ...over,
            });
            await ctx.db.insert(shareLinks).values([
                link('revoked-old', { revokedAt: daysAgo(40) }),
                link('expired-old', { expiresAt: daysAgo(40) }),
                link('revoked-recent', { revokedAt: daysAgo(2) }),
                link('expired-recent', { expiresAt: daysAgo(2) }),
                link('live', {}),
                link('future', { expiresAt: new Date(now.getTime() + 86_400_000) }),
            ]);
            expect(await purgeDeadLinks(ctx.db, 30, now)).toBe(2);
            const left = (await ctx.db.select().from(shareLinks))
                .map((l) => l.tokenHash)
                .sort();
            expect(left).toEqual([
                'hash-expired-recent',
                'hash-future',
                'hash-live',
                'hash-revoked-recent',
            ]);
            expect(await purgeDeadLinks(ctx.db, 0, now)).toBe(0);
        });
    });

    describe('startMaintenance', () => {
        const config = {
            auditRetentionDays: 0,
            snapshotKeep: 0,
            driftReportKeep: 0,
            deadLinkKeepDays: 0,
        };
        const expired = (id: string) => ({
            id,
            userId,
            expiresAt: new Date(Date.now() - 1000),
        });
        const left = async () =>
            (await ctx.db.select().from(sessions)).map((s) => s.id);

        it('cleans up at once, again on every interval, and stops when told', async () => {
            await ctx.db.delete(sessions);
            await ctx.db.insert(sessions).values(expired('first'));
            const stop = startMaintenance({ db: ctx.db, config }, 25);
            // the first run is immediate
            await vi.waitFor(async () => expect(await left()).toEqual([]));
            // a later interval picks up new work
            await ctx.db.insert(sessions).values(expired('second'));
            await vi.waitFor(async () => expect(await left()).toEqual([]));

            await stop();
            // after stop() resolves nothing runs any more
            await ctx.db.insert(sessions).values(expired('third'));
            await new Promise((resolve) => setTimeout(resolve, 100));
            expect(await left()).toEqual(['third']);
        });

        it('lets the first run finish, then never runs again after an immediate stop', async () => {
            await ctx.db.delete(sessions);
            const stop = startMaintenance({ db: ctx.db, config }, 60_000);
            await stop();
            await ctx.db.insert(sessions).values(expired('late'));
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(await left()).toEqual(['late']);
        });
    });
});
