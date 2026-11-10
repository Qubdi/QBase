import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    auditLog,
    diagrams,
    sessions,
    snapshots,
    users,
} from '../src/db/schema.js';
import { MAINTENANCE_LOCK, withAdvisoryLock } from '../src/db/client.js';
import { startMaintenance } from '../src/maintenance.js';
import {
    as,
    createDiagram,
    createTestApp,
    grant,
    projectFor,
    registerUser,
    sampleContent,
    withBase,
    type TestCtx,
    type TestUser,
} from './helpers.js';

const content = (tables: number) => ({
    ...sampleContent,
    tables: Array.from({ length: tables }, (_, i) => ({ id: `t${i}` })),
});

describe('the diagram list for viewers reads the latest snapshot only', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    let viewer: TestUser;
    let first: string;
    let second: string;

    beforeAll(async () => {
        ctx = await createTestApp();
        owner = await registerUser(ctx.app, 'owner@example.com');
        viewer = await registerUser(ctx.app, 'viewer@example.com');
        first = await createDiagram(ctx.app, owner, 'First');
        second = await createDiagram(ctx.app, owner, 'Second');
        await grant(ctx.app, viewer, 'viewer');
        // three versions each, with a growing number of tables
        for (const id of [first, second]) {
            for (const tables of [1, 2, 3]) {
                await ctx.app.inject({
                    method: 'PUT',
                    url: `/diagrams/${id}`,
                    headers: as(owner),
                    payload: await withBase(ctx.app, owner, id, {
                        content: content(tables),
                    }),
                });
                await ctx.app.inject({
                    method: 'POST',
                    url: `/diagrams/${id}/publish`,
                    headers: as(owner),
                    payload: {},
                });
            }
        }
        // a later edit nobody published yet
        await ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${first}`,
            headers: as(owner),
            payload: await withBase(ctx.app, owner, first, {
                content: content(9),
            }),
        });
    });
    afterAll(() => ctx.close());

    it('shows the newest published numbers of each diagram, once', async () => {
        const res = await ctx.app.inject({
            url: '/diagrams',
            headers: as(viewer),
        });
        const rows = res.json() as { id: string; tableCount: number }[];
        expect(rows).toHaveLength(2);
        expect(rows.find((r) => r.id === first)?.tableCount).toBe(3);
        expect(rows.find((r) => r.id === second)?.tableCount).toBe(3);
    });
});

describe('saving a diagram', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    let id: string;

    beforeAll(async () => {
        ctx = await createTestApp({
            auditSaveMinutes: 60,
            autoPublishCoalesceSeconds: 300,
        });
        owner = await registerUser(ctx.app, 'owner@example.com');
        id = await createDiagram(ctx.app, owner);
    });
    afterAll(() => ctx.close());

    const save = async (payload: object) =>
        ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${id}`,
            headers: as(owner),
            payload: await withBase(ctx.app, owner, id, payload),
        });
    const rows = (action: string) =>
        ctx.db
            .select()
            .from(auditLog)
            .where(eq(auditLog.action, action as 'diagram.update'));
    const copies = () =>
        ctx.db.select().from(snapshots).where(eq(snapshots.diagramId, id));

    it('answers without the content it was sent', async () => {
        const res = await save({ content: content(1) });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).not.toHaveProperty('content');
        expect(body).toMatchObject({ id, role: 'owner', title: 'My diagram' });
        expect(body.unpublishedChanges).toBe(true);
    });

    it('logs a run of saves once, not once per save', async () => {
        await save({ content: content(2) });
        await save({ content: content(3) });
        expect(await rows('diagram.update')).toHaveLength(1);
    });

    it('rewrites the latest auto snapshot while it is fresh', async () => {
        await save({ autoPublish: true });
        expect(await copies()).toHaveLength(1);
        const before = (await copies())[0];

        await save({ content: content(4) });
        await save({ content: content(5) });
        const after = await copies();
        expect(after).toHaveLength(1);
        expect(after[0].id).toBe(before.id);
        expect(after[0].version).toBe(1);
        expect((after[0].content as { tables: unknown[] }).tables).toHaveLength(
            5
        );
        expect(after[0].publishedAt.getTime()).toBeGreaterThanOrEqual(
            before.publishedAt.getTime()
        );
        // one publish row for the version, not one per save
        expect(await rows('diagram.publish')).toHaveLength(1);
    });

    it('starts a new snapshot after a manual one, and when the last is old', async () => {
        const manual = await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${id}/publish`,
            headers: as(owner),
            payload: { note: 'v2' },
        });
        expect(manual.json().version).toBe(2);
        await save({ content: content(6) });
        expect((await copies()).map((c) => c.version).sort()).toEqual([
            1, 2, 3,
        ]);

        await ctx.db
            .update(snapshots)
            .set({ publishedAt: sql`now() - interval '1 hour'` })
            .where(eq(snapshots.version, 3));
        await save({ content: content(7) });
        expect((await copies()).map((c) => c.version).sort()).toEqual([
            1, 2, 3, 4,
        ]);
    });

    it('copies the content into the snapshot as the diagram holds it', async () => {
        const [row] = await ctx.db
            .select()
            .from(diagrams)
            .where(eq(diagrams.id, id));
        const latest = (await copies()).sort(
            (a, b) => b.version - a.version
        )[0];
        expect(latest.content).toEqual(row.content);
        expect(latest.title).toBe(row.title);
        expect(latest.contentHash).toBe(row.contentHash);
    });
});

describe('the list of every diagram is cut to a page unless asked otherwise', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let projectId: string;

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
        projectId = await projectFor(ctx.app);
        const [me] = await ctx.db.select().from(users);
        await ctx.db.insert(diagrams).values(
            Array.from({ length: 105 }, (_, i) => ({
                ownerId: me.id,
                projectId,
                title: `d${i}`,
                content: sampleContent,
            }))
        );
    });
    afterAll(() => ctx.close());

    const count = async (query: string) =>
        (
            await ctx.app.inject({
                url: `/diagrams${query}`,
                headers: as(admin),
            })
        ).json().length;

    it('returns a default page for the unscoped list', async () => {
        expect(await count('')).toBe(100);
    });
    it('returns all of one project', async () => {
        expect(await count(`?projectId=${projectId}`)).toBe(105);
    });
    it('honours an explicit page size', async () => {
        expect(await count('?limit=500')).toBe(105);
        expect(await count('?limit=7&offset=100')).toBe(5);
    });
});

describe('the hourly clean-up runs in one process at a time', () => {
    let ctx: TestCtx;
    let userId: string;
    const config = {
        auditRetentionDays: 0,
        snapshotKeep: 0,
        driftReportKeep: 0,
        deadLinkKeepDays: 0,
    };
    const left = async () => (await ctx.db.select().from(sessions)).length;

    beforeAll(async () => {
        ctx = await createTestApp();
        await registerUser(ctx.app, 'a@example.com');
        userId = (await ctx.db.select().from(users))[0].id;
    });
    afterAll(() => ctx.close());

    it('skips the run while another process holds the lock, and runs after', async () => {
        await ctx.db.delete(sessions);
        await ctx.db
            .insert(sessions)
            .values({
                id: 'old',
                userId,
                expiresAt: new Date(Date.now() - 1000),
            });

        let release!: () => void;
        const held = new Promise<void>((r) => (release = r));
        let locked!: () => void;
        const lockTaken = new Promise<void>((r) => (locked = r));
        const holder = withAdvisoryLock(
            ctx.db,
            MAINTENANCE_LOCK,
            async () => {
                locked();
                await held;
            },
            { wait: true }
        );
        await lockTaken;

        const skipped = await withAdvisoryLock(
            ctx.db,
            MAINTENANCE_LOCK,
            async () => 1,
            {
                wait: false,
            }
        );
        expect(skipped).toEqual({ ran: false });

        await startMaintenance({ db: ctx.db, config }, 60_000)();
        expect(await left()).toBe(1);

        release();
        await holder;
        await startMaintenance({ db: ctx.db, config }, 60_000)();
        expect(await left()).toBe(0);
    });

    it('hands the lock back after the work, even when it throws', async () => {
        await expect(
            withAdvisoryLock(
                ctx.db,
                MAINTENANCE_LOCK,
                async () => {
                    throw new Error('boom');
                },
                { wait: true }
            )
        ).rejects.toThrow('boom');
        const again = await withAdvisoryLock(
            ctx.db,
            MAINTENANCE_LOCK,
            async () => 'ok',
            {
                wait: false,
            }
        );
        expect(again).toEqual({ ran: true, value: 'ok' });
    });
});

describe('indexes for the activity filter and the stats fill', () => {
    let ctx: TestCtx;
    beforeAll(async () => {
        ctx = await createTestApp();
    });
    afterAll(async () => {
        await ctx.close();
    });

    const definition = async (name: string) => {
        const res = await ctx.db.execute(
            sql`select indexdef from pg_indexes where indexname = ${name}`
        );
        return (res.rows[0] as { indexdef: string } | undefined)?.indexdef ?? '';
    };

    it('the action index carries id, so a filtered cursor page walks it', async () => {
        expect(await definition('audit_log_action_at_idx')).toMatch(
            /\(action, at DESC( NULLS FIRST)?, id DESC( NULLS FIRST)?\)/
        );
    });

    it('only snapshots without stats are in the pending index', async () => {
        expect(await definition('snapshots_stats_pending_idx')).toMatch(
            /\(id\) WHERE \(stat_table_count IS NULL\)/
        );
    });
});
