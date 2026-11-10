import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diagrams, driftReports, projects, snapshots, users } from '../src/db/schema.js';
import { pruneDriftReports, pruneSnapshots } from '../src/maintenance.js';
import { createTestApp, registerUser, type TestCtx } from './helpers.js';

describe('the prune deletes go a batch at a time', () => {
    let ctx: TestCtx;
    let diagramA: string;
    let diagramB: string;

    beforeAll(async () => {
        ctx = await createTestApp();
        const [me] = (await registerUser(ctx.app, 'owner@example.com'), await ctx.db.select().from(users));
        const [project] = await ctx.db.insert(projects).values({ name: 'Prune', slug: 'prune' }).returning({ id: projects.id });
        [{ id: diagramA }, { id: diagramB }] = await ctx.db
            .insert(diagrams)
            .values([
                { projectId: project.id, ownerId: me.id, title: 'A', content: {} },
                { projectId: project.id, ownerId: me.id, title: 'B', content: {} },
            ])
            .returning({ id: diagrams.id });
        await ctx.db.insert(snapshots).values(
            [diagramA, diagramB].flatMap((diagramId) =>
                Array.from({ length: 10 }, (_, i) => ({
                    diagramId,
                    version: i + 1,
                    title: 'T',
                    content: {},
                    contentHash: `${diagramId}-${i}`,
                }))
            )
        );
        await ctx.db.insert(driftReports).values(
            [diagramA, diagramB].flatMap((diagramId) =>
                Array.from({ length: 9 }, (_, i) => ({
                    diagramId,
                    runAt: new Date(Date.UTC(2026, 0, i + 1)),
                    status: 'clean' as const,
                    trigger: 'manual' as const,
                }))
            )
        );
    });
    afterAll(() => ctx.close());

    it('removes old snapshots over several batches and keeps the newest of each diagram', async () => {
        // keep 3 of 10 for each of two diagrams: 14 rows, in batches of 4
        expect(await pruneSnapshots(ctx.db, 3, 4)).toBe(14);
        const left = await ctx.db.select({ d: snapshots.diagramId, v: snapshots.version }).from(snapshots);
        expect(left).toHaveLength(6);
        for (const d of [diagramA, diagramB]) {
            expect(left.filter((r) => r.d === d).map((r) => r.v).sort((a, b) => a - b)).toEqual([8, 9, 10]);
        }
        expect(await pruneSnapshots(ctx.db, 3, 4)).toBe(0);
    });

    it('removes old drift reports over several batches and keeps the newest of each diagram', async () => {
        // keep 2 of 9 for each of two diagrams: 14 rows, in batches of 5
        expect(await pruneDriftReports(ctx.db, 2, 5)).toBe(14);
        const left = await ctx.db.select({ d: driftReports.diagramId, at: driftReports.runAt }).from(driftReports);
        expect(left).toHaveLength(4);
        for (const d of [diagramA, diagramB]) {
            expect(left.filter((r) => r.d === d).map((r) => r.at.getUTCDate()).sort((a, b) => a - b)).toEqual([8, 9]);
        }
    });
});
