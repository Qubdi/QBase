import { desc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diagrams, snapshots } from '../src/db/schema.js';
import { diagramStats } from '../src/diagrams/summary.js';
import { fillStoredStats, runMaintenance } from '../src/maintenance.js';
import { diagramFingerprintAsync, diagramHash, stableStringify } from '../src/lib/hash.js';
import { LINT_BODY_LIMIT } from '../src/lint/routes.js';
import diagramFixture from './fixtures/postgres-diagram.json' with { type: 'json' };
import {
    as,
    createDiagram,
    createTestApp,
    registerUser,
    sampleContent,
    withBase,
    type TestCtx,
    type TestUser,
} from './helpers.js';

const shop = {
    ...sampleContent,
    databaseEdition: 'supabase',
    tables: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
    relationships: [{ id: 'r1' }],
    createdAt: '2025-03-01T10:00:00.000Z',
};

describe('the fingerprint of a diagram', () => {
    it('hashes as before and counts the bytes of the compact JSON it hashed', async () => {
        const content = { ...shop, updatedAt: '2025-03-02T00:00:00.000Z', note: 'héllo ✓' };
        const { hash, bytes } = await diagramFingerprintAsync('Shop', content);
        expect(hash).toBe(diagramHash('Shop', content));
        const { updatedAt: _ignored, ...rest } = content;
        expect(bytes).toBe(
            Buffer.byteLength(stableStringify({ title: 'Shop', content: rest }))
        );
    });

    it('counts a body larger than one flush', async () => {
        const content = { tables: Array.from({ length: 4000 }, (_, i) => ({ id: `t${i}`, name: 'x'.repeat(40) })) };
        const { bytes } = await diagramFingerprintAsync('T', content);
        expect(bytes).toBe(Buffer.byteLength(stableStringify({ title: 'T', content })));
        expect(bytes).toBeGreaterThan(1 << 16);
    });
});

describe('what is stored with a diagram', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    let viewer: TestUser;
    let id: string;

    const row = async () =>
        (await ctx.db.select().from(diagrams).where(eq(diagrams.id, id)))[0];
    const put = async (payload: object) =>
        ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${id}`,
            headers: as(owner),
            payload: await withBase(ctx.app, owner, id, payload),
        });

    beforeAll(async () => {
        ctx = await createTestApp();
        owner = await registerUser(ctx.app, 'owner@example.com');
        viewer = await registerUser(ctx.app, 'viewer@example.com');
        id = await createDiagram(ctx.app, owner, 'Shop');
    });
    afterAll(() => ctx.close());

    it('has plain stat columns, not generated ones', async () => {
        const res = await ctx.db.execute<{ attname: string; attgenerated: string }>(sql`
            select attname, attgenerated from pg_attribute
            where attrelid = 'diagrams'::regclass and attname like 'stat\\_%'
        `);
        expect(res.rows.length).toBe(6);
        expect(res.rows.every((r) => r.attgenerated === '')).toBe(true);
    });

    it('writes the numbers and the size when a diagram is made', async () => {
        const made = await ctx.app.inject({
            method: 'POST',
            url: '/diagrams',
            headers: as(owner),
            payload: { title: 'Made', content: shop, projectId: (await row()).projectId },
        });
        const r = (
            await ctx.db.select().from(diagrams).where(eq(diagrams.id, made.json().id))
        )[0];
        expect(r).toMatchObject({
            statDatabaseType: 'postgresql',
            statDatabaseEdition: 'supabase',
            statTableCount: 3,
            statRelationshipCount: 1,
            statCreatedAt: '2025-03-01T10:00:00.000Z',
        });
        expect(r.statContentBytes).toBe(
            (await diagramFingerprintAsync('Made', shop)).bytes
        );
    });

    it('rewrites them when the content is saved and keeps them for a rename', async () => {
        expect((await put({ content: { ...shop, tables: [{ id: 'only' }] } })).statusCode).toBe(200);
        const saved = await row();
        expect(saved.statTableCount).toBe(1);
        expect(saved.statContentBytes).toBe(
            (await diagramFingerprintAsync('Shop', { ...shop, tables: [{ id: 'only' }] })).bytes
        );
        expect((await put({ title: 'Renamed' })).statusCode).toBe(200);
        const renamed = await row();
        expect(renamed.statTableCount).toBe(1);
        expect(renamed.statContentBytes).toBe(saved.statContentBytes);
    });

    it('computes the same numbers in the app as the content gives', async () => {
        const stats = diagramStats({ ...shop, tables: 'nope' });
        expect(stats.tableCount).toBe(0);
    });

    it('copies them into each snapshot, so the viewer list reads columns', async () => {
        await put({ content: shop });
        await ctx.app.inject({ method: 'POST', url: `/diagrams/${id}/publish`, headers: as(owner), payload: {} });
        const [snap] = await ctx.db.select().from(snapshots).where(eq(snapshots.diagramId, id)).orderBy(desc(snapshots.version));
        expect(snap).toMatchObject({
            statDatabaseType: 'postgresql',
            statTableCount: 3,
            statRelationshipCount: 1,
        });
        expect(snap.statContentBytes).toBe((await row()).statContentBytes);

        // proof that the list reads the columns: a number that the content does not hold
        await ctx.db.update(snapshots).set({ statTableCount: 99 }).where(eq(snapshots.id, snap.id));
        const { grant } = await import('./helpers.js');
        await grant(ctx.app, viewer, 'viewer');
        const list = (await ctx.app.inject({ url: '/diagrams', headers: as(viewer) })).json() as Array<{ id: string; tableCount: number }>;
        expect(list.find((d) => d.id === id)?.tableCount).toBe(99);

        // a snapshot without stored numbers is read from its content
        await ctx.db
            .update(snapshots)
            .set({ statTableCount: null, statRelationshipCount: null, statDatabaseType: null, statContentBytes: null })
            .where(eq(snapshots.id, snap.id));
        const again = (await ctx.app.inject({ url: '/diagrams', headers: as(viewer) })).json() as Array<{ id: string; tableCount: number; relationshipCount: number; databaseType: string }>;
        expect(again.find((d) => d.id === id)).toMatchObject({
            tableCount: 3,
            relationshipCount: 1,
            databaseType: 'postgresql',
        });
    });

    it('rewrites a fresh auto snapshot with the stats of the working copy', async () => {
        await put({ autoPublish: true });
        await put({ content: { ...shop, tables: [{ id: 'a' }, { id: 'b' }] } });
        const [snap] = await ctx.db.select().from(snapshots).where(eq(snapshots.diagramId, id)).orderBy(desc(snapshots.version));
        expect(snap.statTableCount).toBe(2);
    });

    it('checks the size limits against the stored size, and measures a row without one', async () => {
        // a diagram the linter accepts
        expect((await put({ content: diagramFixture.content })).statusCode).toBe(200);
        const lint = async () =>
            (await ctx.app.inject({ url: `/diagrams/${id}/lint?source=working`, headers: as(owner) }));
        expect((await lint()).statusCode).toBe(200);
        // a stored size over the cap: refused without the content being read
        await ctx.db.update(diagrams).set({ statContentBytes: LINT_BODY_LIMIT + 1 }).where(eq(diagrams.id, id));
        const refused = await lint();
        expect(refused.statusCode).toBe(413);
        expect(refused.json().error).toBe('diagram_too_large');
        // no stored size: measured from the content, which is small
        await ctx.db.update(diagrams).set({ statContentBytes: null }).where(eq(diagrams.id, id));
        expect((await lint()).statusCode).toBe(200);
    });
});

describe('filling in the stats of rows written before they were stored', () => {
    let ctx: TestCtx;
    let owner: TestUser;

    beforeAll(async () => {
        ctx = await createTestApp();
        owner = await registerUser(ctx.app, 'owner@example.com');
    });
    afterAll(() => ctx.close());

    it('works the numbers out in batches, leaves a filled row alone and ends', async () => {
        const ids: string[] = [];
        for (let i = 0; i < 5; i++) ids.push(await createDiagram(ctx.app, owner, `D${i}`));
        for (const id of ids) {
            await ctx.app.inject({ method: 'POST', url: `/diagrams/${id}/publish`, headers: as(owner), payload: {} });
        }
        // what a migrated database looks like: diagrams without a size, snapshots without numbers
        await ctx.db.update(diagrams).set({ statContentBytes: null });
        await ctx.db
            .update(snapshots)
            .set({ statDatabaseType: null, statDatabaseEdition: null, statTableCount: null, statRelationshipCount: null, statCreatedAt: null, statContentBytes: null });
        const filled = await fillStoredStats(ctx.db, 2);
        expect(filled).toBe(10);
        const ds = await ctx.db.select().from(diagrams);
        expect(ds.every((d) => (d.statContentBytes ?? 0) > 0)).toBe(true);
        const ss = await ctx.db.select().from(snapshots);
        expect(ss).toHaveLength(5);
        expect(ss.every((s) => s.statTableCount === 0 && s.statDatabaseType === 'postgresql' && (s.statContentBytes ?? 0) > 0)).toBe(true);
        expect(await fillStoredStats(ctx.db, 2)).toBe(0);
    });

    it('stops at the number of batches it was given and goes on at the next run', async () => {
        await ctx.db.update(snapshots).set({ statTableCount: null });
        expect(await fillStoredStats(ctx.db, 1, 2)).toBe(2);
        expect(await fillStoredStats(ctx.db, 1, 10)).toBe(3);
    });

    it('is a step of the hourly maintenance', async () => {
        await ctx.db.update(snapshots).set({ statTableCount: null });
        const result = await runMaintenance(ctx.db, { auditRetentionDays: 0, snapshotKeep: 0, driftReportKeep: 0, deadLinkKeepDays: 0 });
        expect(result.stats).toBe(5);
        expect(result.failed).toEqual([]);
    });
});

describe('the foreign keys that point at users have an index', () => {
    let ctx: TestCtx;
    beforeAll(async () => {
        ctx = await createTestApp();
    });
    afterAll(() => ctx.close());

    it('finds no foreign key column that starts no index', async () => {
        const res = await ctx.db.execute<{ t: string; col: string }>(sql`
            select c.conrelid::regclass::text as t, a.attname as col
            from pg_constraint c
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f'
              and not exists (
                select 1 from pg_index i
                where i.indrelid = c.conrelid and i.indkey[0] = a.attnum
              )
        `);
        expect(res.rows).toEqual([]);
    });
});
