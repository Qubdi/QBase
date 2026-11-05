import http from 'node:http';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { auditLog, driftReports, driftSettings } from '../src/db/schema.js';
import { DRIFT_DIAGRAM_LIMIT, latestReportSummary, runDriftCheck } from '../src/drift/service.js';
import type {
    DatabaseMetadata,
    Introspector,
    IntrospectorFactory,
} from '../src/introspect/types.js';
import diagramFixture from './fixtures/postgres-diagram.json' with { type: 'json' };
import metadataFixture from './fixtures/postgres-metadata.json' with { type: 'json' };
import {
    as,
    createTestApp,
    registerUser,
    type TestCtx,
    withBase,
    type TestUser,
    grant,
    projectFor,
} from './helpers.js';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const base = metadataFixture as unknown as DatabaseMetadata;

let meta: DatabaseMetadata;
let factoryCalls = 0;
let factoryDelayMs = 0;
let factoryError: Error | null = null;

const factory: IntrospectorFactory = async () => {
    factoryCalls++;
    if (factoryError) throw factoryError;
    const intro: Introspector = {
        catalog: async () => [],
        introspect: async () => {
            if (factoryDelayMs) await new Promise((r) => setTimeout(r, factoryDelayMs));
            return clone(meta);
        },
        close: async () => undefined,
    };
    return intro;
};

const PASSWORD = 'drift-p@ss-SECRET';
const conn = () => ({
    dialect: 'postgresql',
    host: '93.184.216.34',
    database: 'shop',
    user: 'reader',
    password: PASSWORD,
});

describe('drift detection', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    let editor: TestUser;
    let viewer: TestUser;
    let stranger: TestUser;
    let diagramId: string;
    let connectionId: string;

    const settings = (over: object = {}) => ({
        connectionId,
        schemas: [],
        tables: [],
        sourceKeys: { tables: {}, columns: {} },
        webhookUrl: null,
        ...over,
    });
    const put = (u: TestUser, payload: object, id = diagramId) =>
        ctx.app.inject({ method: 'PUT', url: `/diagrams/${id}/drift`, headers: as(u), payload });
    const check = (u: TestUser = owner, id = diagramId) =>
        ctx.app.inject({ method: 'POST', url: `/diagrams/${id}/drift/check`, headers: as(u) });
    const get = (u: TestUser = owner, id = diagramId) =>
        ctx.app.inject({ url: `/diagrams/${id}/drift`, headers: as(u) });

    const addColumn = (name: string, over: Record<string, unknown> = {}) =>
        meta.columns.push({
            schema: 'public',
            table: 'customers',
            name,
            type: 'text',
            ordinal_position: 99,
            nullable: true,
            ...over,
        } as DatabaseMetadata['columns'][number]);

    beforeAll(async () => {
        ctx = await createTestApp(
            { connectionKey: 'a-long-enough-connection-key' },
            { factory }
        );
        owner = await registerUser(ctx.app, 'owner@example.com');
        editor = await registerUser(ctx.app, 'editor@example.com');
        viewer = await registerUser(ctx.app, 'viewer@example.com');
        stranger = await registerUser(ctx.app, 'stranger@example.com');

        const created = await ctx.app.inject({
            method: 'POST',
            url: '/diagrams',
            headers: as(owner),
            payload: { ...diagramFixture, projectId: await projectFor(ctx.app) },
        });
        diagramId = created.json().id;
        for (const [u, role] of [
            [editor, 'editor'],
            [viewer, 'viewer'],
        ] as const) {
            await grant(ctx.app, u, role);
        }
        const saved = await ctx.app.inject({
            method: 'POST',
            url: '/introspect/connections',
            headers: as(owner),
            payload: { ...conn(), projectId: await projectFor(ctx.app), name: 'prod' },
        });
        connectionId = saved.json().id;
    });
    afterAll(() => ctx.close());

    beforeEach(async () => {
        meta = clone(base);
        factoryCalls = 0;
        factoryDelayMs = 0;
        factoryError = null;
        await ctx.db.delete(driftReports);
        await ctx.db.delete(driftSettings);
    });

    describe('access', () => {
        it('requires login', async () => {
            for (const [method, url] of [
                ['GET', `/diagrams/${diagramId}/drift`],
                ['PUT', `/diagrams/${diagramId}/drift`],
                ['POST', `/diagrams/${diagramId}/drift/check`],
                ['GET', `/diagrams/${diagramId}/drift/reports`],
                ['POST', `/diagrams/${diagramId}/drift/dismiss`],
            ] as const) {
                const res = await ctx.app.inject({ method, url, payload: {} });
                expect(res.statusCode, `${method} ${url}`).toBe(401);
            }
        });

        it('lets owners and editors in, but not viewers, and hides the diagram from strangers', async () => {
            for (const u of [owner, editor]) expect((await get(u)).statusCode).toBe(200);
            expect((await get(viewer)).statusCode).toBe(403);
            expect((await get(stranger)).statusCode).toBe(404);
            expect((await put(viewer, settings())).statusCode).toBe(403);
            expect((await put(stranger, settings())).statusCode).toBe(404);
            expect((await check(viewer)).statusCode).toBe(403);
            expect((await check(stranger)).statusCode).toBe(404);
            const reports = await ctx.app.inject({ url: `/diagrams/${diagramId}/drift/reports`, headers: as(viewer) });
            expect(reports.statusCode).toBe(403);
        });
    });

    describe('settings', () => {
        it('starts unconfigured', async () => {
            const res = await get();
            expect(res.json()).toEqual({ settings: null, latest: null, badge: null });
        });

        it('saves the settings, which have no schedule', async () => {
            const res = await put(owner, settings({ webhookUrl: 'https://hooks.example.com/drift' }));
            expect(res.statusCode).toBe(200);
            expect(res.json()).toMatchObject({
                connectionId,
                webhookHost: 'hooks.example.com',
            });
            expect(res.json()).not.toHaveProperty('webhookUrl');
            const stored = (await get()).json().settings;
            for (const gone of ['enabled', 'schedule', 'nextRunAt']) {
                expect(res.json()).not.toHaveProperty(gone);
                expect(stored).not.toHaveProperty(gone);
            }
        });

        it('ignores a schedule sent by an old client', async () => {
            const res = await put(owner, settings({ enabled: true, schedule: '*/10 * * * *' }));
            expect(res.statusCode).toBe(200);
            expect(res.json().schedule).toBeUndefined();
        });

        it('rejects bad webhooks and connections', async () => {
            expect((await put(owner, settings({ webhookUrl: 'ftp://x.example.com' }))).json().error).toBe('invalid_webhook');
            expect((await put(owner, settings({ webhookUrl: 'not a url' }))).statusCode).toBe(400);
            expect((await put(owner, settings({ webhookUrl: 'https://user:pw@x.example.com/h' }))).statusCode).toBe(400);
            expect((await put(owner, settings({ connectionId: '00000000-0000-4000-8000-000000000000' }))).json().error).toBe('connection_not_found');
        });

        it("will not use another project's saved connection", async () => {
            const otherProject = await ctx.app.inject({
                method: 'POST',
                url: '/admin/projects',
                headers: as(owner),
                payload: { name: `Elsewhere ${Math.random()}` },
            });
            const theirs = await ctx.app.inject({
                method: 'POST',
                url: '/introspect/connections',
                headers: as(owner),
                payload: { ...conn(), name: 'elsewhere', projectId: otherProject.json().id },
            });
            const res = await put(owner, settings({ connectionId: theirs.json().id }));
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toBe('connection_not_found');
        });

        it('allows saving settings before a connection is chosen, but will not check without one', async () => {
            const res = await put(owner, settings({ connectionId: null }));
            expect(res.statusCode).toBe(200);
            const checked = await check();
            expect(checked.statusCode).toBe(400);
            expect(checked.json().error).toBe('connection_required');
            expect(factoryCalls).toBe(0);
            expect(await ctx.db.select().from(driftReports)).toHaveLength(0);
        });

        it('does not run a check before it is configured', async () => {
            const res = await check();
            expect(res.statusCode).toBe(409);
            expect(res.json().error).toBe('not_configured');
        });
    });

    describe('what a check finds', () => {
        beforeEach(async () => {
            expect((await put(owner, settings())).statusCode).toBe(200);
        });

        it('reports clean when the database matches the diagram', async () => {
            const res = await check();
            expect(res.statusCode).toBe(200);
            expect(res.json()).toMatchObject({ status: 'clean', counts: { breaking: 0, warning: 0, info: 0 }, changes: [] });
            expect((await get()).json().badge).toBeNull();
        });

        const cases: Array<{
            name: string;
            mutate: () => void;
            expected: { id: string; severity: string; category: string };
        }> = [
            {
                name: 'a new nullable column is a warning, only in the database',
                mutate: () => addColumn('phone'),
                expected: { id: 'column_added:public.customers.phone', severity: 'warning', category: 'only_in_database' },
            },
            {
                name: 'a new required column without a default is breaking',
                mutate: () => addColumn('tenant_id', { type: 'integer', nullable: false }),
                expected: { id: 'column_added:public.customers.tenant_id', severity: 'breaking', category: 'only_in_database' },
            },
            {
                name: 'a dropped column is breaking, only in the diagram',
                mutate: () => {
                    meta.columns = meta.columns.filter((c) => !(c.table === 'customers' && c.name === 'full_name'));
                },
                expected: { id: 'column_removed:public.customers.full_name', severity: 'breaking', category: 'only_in_diagram' },
            },
            {
                name: 'a retyped column is breaking, and the definitions differ',
                mutate: () => {
                    const c = meta.columns.find((x) => x.table === 'customers' && x.name === 'full_name')!;
                    c.type = 'integer';
                },
                expected: { id: 'column_changed:public.customers.full_name', severity: 'breaking', category: 'differs' },
            },
            {
                name: 'a changed default is information',
                mutate: () => {
                    meta.columns.find((x) => x.table === 'customers' && x.name === 'full_name')!.default = "'anon'::text";
                },
                expected: { id: 'column_changed:public.customers.full_name', severity: 'info', category: 'differs' },
            },
            {
                name: 'a changed column comment is information',
                mutate: () => {
                    meta.columns.find((x) => x.table === 'customers' && x.name === 'full_name')!.comment = 'Shown on invoices';
                },
                expected: { id: 'column_changed:public.customers.full_name', severity: 'info', category: 'differs' },
            },
            {
                name: 'a changed table comment is information',
                mutate: () => {
                    meta.tables.find((t) => t.table === 'customers')!.comment = 'Paying customers';
                },
                expected: { id: 'table_comment_changed:public.customers', severity: 'info', category: 'differs' },
            },
            {
                name: 'a nullability change is a warning',
                mutate: () => {
                    meta.columns.find((x) => x.table === 'customers' && x.name === 'full_name')!.nullable = false;
                },
                expected: { id: 'column_changed:public.customers.full_name', severity: 'warning', category: 'differs' },
            },
            {
                name: 'a new table is information, only in the database',
                mutate: () => {
                    meta.tables.push({ schema: 'shop', table: 'payments', type: 'BASE TABLE' });
                    addColumn('x');
                    meta.columns.pop();
                    meta.columns.push({ schema: 'shop', table: 'payments', name: 'id', type: 'integer', ordinal_position: 1, nullable: false } as DatabaseMetadata['columns'][number]);
                },
                expected: { id: 'table_added:shop.payments', severity: 'info', category: 'only_in_database' },
            },
            {
                name: 'a dropped table is breaking, only in the diagram',
                mutate: () => {
                    meta.tables = meta.tables.filter((t) => t.table !== 'order_items');
                    for (const k of ['columns', 'pk_info', 'indexes'] as const) {
                        (meta[k] as Array<{ table: string }>) = (meta[k] as Array<{ table: string }>).filter((x) => x.table !== 'order_items');
                    }
                    meta.fk_info = meta.fk_info.filter((f) => f.table !== 'order_items');
                },
                expected: { id: 'table_removed:shop.order_items', severity: 'breaking', category: 'only_in_diagram' },
            },
        ];

        it.each(cases)('$name', async ({ mutate, expected }) => {
            mutate();
            const res = await check();
            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(body.status).toBe('drifted');
            const hit = body.changes.find((c: { id: string }) => c.id === expected.id);
            expect(hit, JSON.stringify(body.changes.map((c: { id: string }) => c.id))).toBeDefined();
            expect(hit).toMatchObject({ severity: expected.severity, category: expected.category });
            expect(typeof hit.summary).toBe('string');
            expect(body.counts[expected.severity]).toBeGreaterThan(0);
        });

        it('reports a dropped foreign key as a warning', async () => {
            meta.fk_info = meta.fk_info.filter((f) => f.foreign_key_name !== 'orders_customer_fk');
            const body = (await check()).json();
            expect(body.changes).toHaveLength(1);
            expect(body.changes[0]).toMatchObject({ kind: 'relationship_removed', severity: 'warning', category: 'only_in_diagram' });
        });

        it('lists the most serious changes first and counts each severity', async () => {
            addColumn('phone');
            meta.columns = meta.columns.filter((c) => !(c.table === 'customers' && c.name === 'full_name'));
            meta.tables.find((t) => t.table === 'customers')!.comment = 'x';
            const body = (await check()).json();
            expect(body.changes.map((c: { severity: string }) => c.severity)).toEqual(['breaking', 'warning', 'info']);
            expect(body.counts).toEqual({ breaking: 1, warning: 1, info: 1 });
            expect(body.worst).toBe('breaking');
        });

        it('suggests renames without counting them as extra drift', async () => {
            for (const k of ['tables', 'columns', 'pk_info', 'indexes'] as const) {
                for (const x of meta[k] as Array<{ schema: string; table: string }>) {
                    if (x.schema === 'shop' && x.table === 'orders') x.table = 'purchases';
                }
            }
            for (const f of meta.fk_info) {
                if (f.table === 'orders') f.table = 'purchases';
                if (f.reference_table === 'orders') f.reference_table = 'purchases';
            }
            const body = (await check()).json();
            expect(body.renameHints).toEqual(['shop.orders may have been renamed to shop.purchases']);
            expect(body.status).toBe('drifted');
        });

        it('ignores database tables outside the stored selection', async () => {
            await put(owner, settings({ tables: ['public.customers', 'shop.order_items', 'shop.orders', 'shop.paid_orders'] }));
            meta.tables.push({ schema: 'shop', table: 'extra', type: 'BASE TABLE' });
            expect((await check()).json().status).toBe('clean');
            // without a selection the same table is reported
            await put(owner, settings({ tables: [] }));
            const body = (await check()).json();
            expect(body.changes.map((c: { id: string }) => c.id)).toEqual(['table_added:shop.extra']);
        });

        it('keeps a locally renamed table matched through the stored source identity', async () => {
            const content = clone(diagramFixture.content) as { tables: Array<{ id: string; name: string }> };
            const customers = content.tables.find((t) => t.name === 'customers')!;
            customers.name = 'clients';
            await ctx.app.inject({ method: 'PUT', url: `/diagrams/${diagramId}`, headers: as(owner), payload: await withBase(ctx.app, owner, diagramId, { content }) });
            try {
                const without = (await check()).json();
                expect(without.status).toBe('drifted');
                await put(owner, settings({ sourceKeys: { tables: { [customers.id]: 'public.customers' }, columns: {} } }));
                const withKeys = (await check()).json();
                expect(withKeys.status).toBe('clean');
            } finally {
                await ctx.app.inject({ method: 'PUT', url: `/diagrams/${diagramId}`, headers: as(owner), payload: await withBase(ctx.app, owner, diagramId, { ...diagramFixture, projectId: await projectFor(ctx.app) }) });
            }
        });
    });

    describe('failures are errors, not drift', () => {
        beforeEach(async () => {
            expect((await put(owner, settings())).statusCode).toBe(200);
        });

        it('reports a connection failure as an error with nothing to compare', async () => {
            factoryError = new Error(`password authentication failed for user "reader" (${PASSWORD})`);
            const body = (await check()).json();
            expect(body.status).toBe('error');
            expect(body.changes).toEqual([]);
            expect(body.counts).toEqual({ breaking: 0, warning: 0, info: 0 });
            expect(body.error).toMatch(/authentication failed/);
            expect(JSON.stringify(body)).not.toContain(PASSWORD);
        });

        it('reports a diagram over the size cap as an error, without reading the database', async () => {
            const { diagrams } = await import('../src/db/schema.js');
            const [row] = await ctx.db.select().from(diagrams).where(eq(diagrams.id, diagramId));
            await ctx.db
                .update(diagrams)
                .set({ content: { ...(row.content as object), padding: 'x'.repeat(DRIFT_DIAGRAM_LIMIT + 1024) } })
                .where(eq(diagrams.id, diagramId));
            try {
                const body = (await check()).json();
                expect(body.status).toBe('error');
                expect(body.error).toMatch(/too large/);
                expect(factoryCalls).toBe(0);
            } finally {
                await ctx.db.update(diagrams).set({ content: row.content }).where(eq(diagrams.id, diagramId));
            }
            // under the cap again, it compares as before
            expect((await check()).json().status).not.toBe('error');
        });

        it('says why a check could not start, instead of calling it a check already running', async () => {
            const bare = (
                await ctx.app.inject({ method: 'POST', url: '/diagrams', headers: as(owner), payload: { ...diagramFixture, projectId: await projectFor(ctx.app) } })
            ).json().id;
            const deps = { db: ctx.db, config: loadConfig({ DATABASE_URL: 'postgres://u:p@localhost/db' }), factory };
            // no drift settings: the route says so, and so does the service
            expect((await check(owner, bare)).json().error).toBe('not_configured');
            expect(await runDriftCheck(deps, bare)).toBe('not_configured');
            // nothing with this id at all
            expect(await runDriftCheck(deps, '00000000-0000-4000-8000-000000000000')).toBe('not_configured');
        });

        it('reports a blocked target as an error', async () => {
            await ctx.db.update((await import('../src/db/schema.js')).savedConnections).set({ host: '10.0.0.5' });
            const body = (await check()).json();
            expect(body.status).toBe('error');
            expect(body.error).toMatch(/blocked/);
            expect(factoryCalls).toBe(0);
            await ctx.db.update((await import('../src/db/schema.js')).savedConnections).set({ host: '93.184.216.34' });
        });

        it('asks for another connection after the saved one is deleted', async () => {
            const tmp = await ctx.app.inject({
                method: 'POST',
                url: '/introspect/connections',
                headers: as(owner),
                payload: { ...conn(), projectId: await projectFor(ctx.app), name: 'temp' },
            });
            await put(owner, settings({ connectionId: tmp.json().id }));
            await ctx.app.inject({ method: 'DELETE', url: `/introspect/connections/${tmp.json().id}`, headers: as(owner) });
            // the settings forget the connection, and a check asks for another one
            expect((await get()).json().settings.connectionId).toBeNull();
            const res = await check();
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toBe('connection_required');
        });

        it('an error does not hide earlier drift history and shows as a badge', async () => {
            addColumn('phone');
            expect((await check()).json().status).toBe('drifted');
            factoryError = new Error('connection refused');
            expect((await check()).json().status).toBe('error');
            const reports = (await ctx.app.inject({ url: `/diagrams/${diagramId}/drift/reports`, headers: as(owner) })).json();
            expect(reports.map((r: { status: string }) => r.status)).toEqual(['error', 'drifted']);
            expect((await get()).json().badge).toMatchObject({ status: 'error' });
        });

        it('recovers: a later successful check is clean', async () => {
            factoryError = new Error('boom');
            expect((await check()).json().status).toBe('error');
            factoryError = null;
            expect((await check()).json().status).toBe('clean');
            expect((await get()).json().badge).toBeNull();
        });
    });

    describe('badge and dismissal', () => {
        beforeEach(async () => {
            await put(owner, settings());
        });

        it('shows a badge for undismissed drift and clears it when dismissed', async () => {
            addColumn('phone');
            const report = (await check()).json();
            const badge = (await get()).json().badge;
            expect(badge).toEqual({ status: 'drifted', counts: { breaking: 0, warning: 1, info: 0 }, reportId: report.id });
            const dismissed = await ctx.app.inject({ method: 'POST', url: `/diagrams/${diagramId}/drift/dismiss`, headers: as(owner) });
            expect(dismissed.json().badge).toBeNull();
            expect((await get()).json().latest.dismissedAt).toBeTruthy();
        });

        it('keeps drift dismissed while it stays the same, and raises it again when it changes', async () => {
            addColumn('phone');
            await check();
            await ctx.app.inject({ method: 'POST', url: `/diagrams/${diagramId}/drift/dismiss`, headers: as(owner) });
            await check();
            expect((await get()).json().badge).toBeNull();
            addColumn('fax');
            await check();
            expect((await get()).json().badge).not.toBeNull();
        });

        it('forgets the dismissal once the drift is gone and comes back', async () => {
            addColumn('phone');
            await check();
            await ctx.app.inject({ method: 'POST', url: `/diagrams/${diagramId}/drift/dismiss`, headers: as(owner) });
            meta = clone(base);
            expect((await check()).json().status).toBe('clean');
            addColumn('phone');
            await check();
            expect((await get()).json().badge).not.toBeNull();
        });

        it('dismissing with nothing to dismiss is harmless', async () => {
            const res = await ctx.app.inject({ method: 'POST', url: `/diagrams/${diagramId}/drift/dismiss`, headers: as(owner) });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ latest: null, badge: null });
        });
    });

    describe('reports', () => {
        beforeEach(async () => {
            await put(owner, settings());
        });

        it('lists newest first, honours the limit, and fetches one with its changes', async () => {
            await check();
            addColumn('phone');
            const second = (await check()).json();
            const list = (await ctx.app.inject({ url: `/diagrams/${diagramId}/drift/reports?limit=1`, headers: as(owner) })).json();
            expect(list).toHaveLength(1);
            expect(list[0].id).toBe(second.id);
            expect(list[0]).not.toHaveProperty('changes');
            const detail = (await ctx.app.inject({ url: `/diagrams/${diagramId}/drift/reports/${second.id}`, headers: as(owner) })).json();
            expect(detail.changes).toHaveLength(1);
            expect(detail.trigger).toBe('manual');
        });

        it('reads the badge and the list without the changes, which can be large', async () => {
            addColumn('phone');
            const report = (await check()).json();
            expect(report.changes).toHaveLength(1);
            const summary = await latestReportSummary(ctx.db, diagramId);
            expect(summary.id).toBe(report.id);
            expect(summary).not.toHaveProperty('changes');
            expect(summary).not.toHaveProperty('renameHints');
            // what the badge poll and the dismiss answer is unchanged by that
            const badge = (await ctx.app.inject({ url: `/diagrams/${diagramId}/drift`, headers: as(owner) })).json();
            expect(badge.badge).toMatchObject({ status: 'drifted', reportId: report.id });
            expect(badge.latest).not.toHaveProperty('changes');
            const dismissed = (await ctx.app.inject({ method: 'POST', url: `/diagrams/${diagramId}/drift/dismiss`, headers: as(owner) })).json();
            expect(dismissed.badge).toBeNull();
            expect(dismissed.latest.dismissedAt).not.toBeNull();
        });

        it('validates the limit and 404s for unknown or foreign reports', async () => {
            expect((await ctx.app.inject({ url: `/diagrams/${diagramId}/drift/reports?limit=0`, headers: as(owner) })).statusCode).toBe(400);
            expect((await ctx.app.inject({ url: `/diagrams/${diagramId}/drift/reports/00000000-0000-4000-8000-000000000000`, headers: as(owner) })).statusCode).toBe(404);
            addColumn('phone');
            const report = (await check()).json();
            const other = (
                await ctx.app.inject({ method: 'POST', url: '/diagrams', headers: as(owner), payload: { ...diagramFixture, projectId: await projectFor(ctx.app) } })
            ).json().id;
            const res = await ctx.app.inject({ url: `/diagrams/${other}/drift/reports/${report.id}`, headers: as(owner) });
            expect(res.statusCode).toBe(404);
        });

        it('audits configuration, checks and dismissals', async () => {
            await check();
            await ctx.app.inject({ method: 'POST', url: `/diagrams/${diagramId}/drift/dismiss`, headers: as(owner) });
            const actions = new Set((await ctx.db.select().from(auditLog)).filter((r) => r.diagramId === diagramId).map((r) => r.action));
            for (const a of ['drift.configure', 'drift.check', 'drift.dismiss']) expect(actions.has(a as never), a).toBe(true);
        });

        it('is removed with the diagram', async () => {
            const tmp = (await ctx.app.inject({ method: 'POST', url: '/diagrams', headers: as(owner), payload: { ...diagramFixture, projectId: await projectFor(ctx.app) } })).json().id;
            await put(owner, settings(), tmp);
            await check(owner, tmp);
            await ctx.app.inject({ method: 'DELETE', url: `/diagrams/${tmp}`, headers: as(owner) });
            expect(await ctx.db.select().from(driftReports).where(eq(driftReports.diagramId, tmp))).toHaveLength(0);
            expect(await ctx.db.select().from(driftSettings).where(eq(driftSettings.diagramId, tmp))).toHaveLength(0);
        });
    });

    describe('opening a diagram reuses a recent report', () => {
        const cachedCheck = (u: TestUser = owner, app = ctx.app) =>
            app.inject({ method: 'POST', url: `/diagrams/${diagramId}/drift/check?cached=1`, headers: as(u) });
        const reportCount = async () =>
            (await ctx.db.select().from(driftReports).where(eq(driftReports.diagramId, diagramId))).length;
        const checkAudits = async () =>
            (await ctx.db.select().from(auditLog)).filter((r) => r.diagramId === diagramId && r.action === 'drift.check').length;
        const editDiagram = () =>
            ctx.app.inject({ method: 'PUT', url: `/diagrams/${diagramId}`, headers: as(owner), payload: { autoPublish: false } });

        beforeEach(async () => {
            expect((await put(owner, settings())).statusCode).toBe(200);
        });

        it('reads the database once, then hands back the same report', async () => {
            const first = await cachedCheck();
            expect(first.statusCode).toBe(200);
            const second = await cachedCheck();
            expect(second.statusCode).toBe(200);
            expect(second.json().id).toBe(first.json().id);
            expect(factoryCalls).toBe(1);
            expect(await reportCount()).toBe(1);
        });

        it('hands back everything a check does, including the badge', async () => {
            addColumn('phone');
            const first = (await cachedCheck()).json();
            const again = (await cachedCheck()).json();
            expect(again.status).toBe('drifted');
            expect(again.changes).toHaveLength(1);
            expect(again.badge).toEqual({ status: 'drifted', counts: { breaking: 0, warning: 1, info: 0 }, reportId: first.id });
            expect(factoryCalls).toBe(1);
        });

        it('does not count a reused report as a check in the audit log', async () => {
            const before = await checkAudits();
            await cachedCheck();
            await cachedCheck();
            await cachedCheck();
            expect((await checkAudits()) - before).toBe(1);
        });

        it('always reads the database when a check is asked for', async () => {
            await cachedCheck();
            expect((await check()).statusCode).toBe(200);
            expect(factoryCalls).toBe(2);
            expect(await reportCount()).toBe(2);
        });

        it('shows a change in the database once the report has run out', async () => {
            expect((await cachedCheck()).json().status).toBe('clean');
            addColumn('phone');
            expect((await cachedCheck()).json().status).toBe('clean');
            expect(factoryCalls).toBe(1);
            await ctx.db.update(driftReports).set({ runAt: new Date(Date.now() - 10 * 60_000) });
            expect((await cachedCheck()).json().status).toBe('drifted');
            expect(factoryCalls).toBe(2);
        });

        it('reads again after the diagram is edited', async () => {
            await cachedCheck();
            expect((await editDiagram()).statusCode).toBe(200);
            await cachedCheck();
            expect(factoryCalls).toBe(2);
            // and the new report is reused in its turn
            await cachedCheck();
            expect(factoryCalls).toBe(2);
        });

        it('reads again after the drift settings change', async () => {
            await cachedCheck();
            expect((await put(owner, settings({ schemas: ['public'] }))).statusCode).toBe(200);
            await cachedCheck();
            expect(factoryCalls).toBe(2);
        });

        it('reads again after the saved connection is edited', async () => {
            await cachedCheck();
            // no password: the saved one is kept (so the target must stay the same)
            const { dialect, host, user, database } = conn();
            const edit = (name: string) =>
                ctx.app.inject({
                    method: 'PUT',
                    url: `/introspect/connections/${connectionId}`,
                    headers: as(owner),
                    payload: { name, dialect, host, user, database },
                });
            expect((await edit('prod renamed')).statusCode).toBe(200);
            await cachedCheck();
            expect(factoryCalls).toBe(2);
            expect((await edit('prod')).statusCode).toBe(200);
        });

        it('tries again after a failure instead of reusing it', async () => {
            factoryError = new Error('connection refused');
            expect((await cachedCheck()).json().status).toBe('error');
            factoryError = null;
            expect((await cachedCheck()).json().status).toBe('clean');
            expect(factoryCalls).toBe(2);
            expect(await reportCount()).toBe(2);
        });

        it('is left off by DRIFT_CACHE_SECONDS=0', async () => {
            const off = await createTestApp({ connectionKey: 'a-long-enough-connection-key', driftCacheSeconds: 0 }, { factory }, false);
            try {
                await cachedCheck(owner, off.app);
                await cachedCheck(owner, off.app);
                expect(factoryCalls).toBe(2);
                expect(await reportCount()).toBe(2);
            } finally {
                await off.close();
            }
        });

        it('is only for people who can edit, and only takes cached=1', async () => {
            expect((await cachedCheck(viewer)).statusCode).toBe(403);
            expect((await cachedCheck(stranger)).statusCode).toBe(404);
            const odd = await ctx.app.inject({ method: 'POST', url: `/diagrams/${diagramId}/drift/check?cached=yes`, headers: as(owner) });
            expect(odd.statusCode).toBe(400);
            expect(factoryCalls).toBe(0);
        });
    });

    describe('concurrency', () => {
        it('does not run two checks of one diagram at once', async () => {
            await put(owner, settings());
            factoryDelayMs = 150;
            const [a, b] = await Promise.all([check(), check()]);
            expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
            expect([a, b].find((r) => r.statusCode === 409)!.json().error).toBe('already_running');
        });
    });
});

describe('drift webhooks', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    let server: http.Server;
    let port: number;
    let received: Array<{ body: Record<string, unknown>; headers: http.IncomingHttpHeaders }> = [];
    let respondWith = 200;
    let diagramId: string;
    let connectionId: string;

    beforeAll(async () => {
        server = http.createServer((req, res) => {
            let data = '';
            req.on('data', (c) => (data += c));
            req.on('end', () => {
                received.push({ body: JSON.parse(data || '{}'), headers: req.headers });
                res.statusCode = respondWith;
                res.end('ok');
            });
        });
        await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
        port = (server.address() as { port: number }).port;

        ctx = await createTestApp(
            { connectionKey: 'a-long-enough-connection-key', introspectAllowHosts: ['127.0.0.1'] },
            { factory }
        );
        owner = await registerUser(ctx.app, 'hook@example.com');
        diagramId = (await ctx.app.inject({ method: 'POST', url: '/diagrams', headers: as(owner), payload: { ...diagramFixture, projectId: await projectFor(ctx.app) } })).json().id;
        connectionId = (
            await ctx.app.inject({ method: 'POST', url: '/introspect/connections', headers: as(owner), payload: { ...conn(), projectId: await projectFor(ctx.app), name: 'c' } })
        ).json().id;
    });
    afterAll(async () => {
        await ctx.close();
        await new Promise((r) => server.close(r));
    });
    beforeEach(async () => {
        meta = clone(base);
        factoryError = null;
        received = [];
        respondWith = 200;
        await ctx.db.delete(driftReports);
        await ctx.db.delete(driftSettings);
        const res = await ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${diagramId}/drift`,
            headers: as(owner),
            payload: { connectionId, webhookUrl: `http://127.0.0.1:${port}/hook` },
        });
        expect(res.statusCode).toBe(200);
    });

    const check = () => ctx.app.inject({ method: 'POST', url: `/diagrams/${diagramId}/drift/check`, headers: as(owner) });
    const drift = (name: string) =>
        meta.columns.push({ schema: 'public', table: 'customers', name, type: 'text', ordinal_position: 99, nullable: true } as DatabaseMetadata['columns'][number]);

    it('posts JSON when drift is first found', async () => {
        drift('phone');
        const report = (await check()).json();
        expect(received).toHaveLength(1);
        expect(received[0].headers['content-type']).toBe('application/json');
        expect(received[0].body).toMatchObject({
            event: 'qbase.drift',
            diagramId,
            diagramTitle: 'Shop',
            status: 'drifted',
            counts: { breaking: 0, warning: 1, info: 0 },
        });
        expect((received[0].body.changes as Array<{ summary: string }>)[0].summary).toMatch(/phone/);
        expect(report.webhook).toMatch(/^sent \(200\)/);
    });

    it('does not post for a clean database', async () => {
        await check();
        expect(received).toHaveLength(0);
    });

    it('does not repeat itself for identical drift, but posts again when it changes', async () => {
        drift('phone');
        await check();
        await check();
        expect(received).toHaveLength(1);
        drift('fax');
        await check();
        expect(received).toHaveLength(2);
    });

    it('posts again when drift returns after being fixed', async () => {
        drift('phone');
        await check();
        meta = clone(base);
        await check();
        drift('phone');
        await check();
        expect(received).toHaveLength(2);
    });

    it('also tells you about errors', async () => {
        factoryError = new Error('connection refused');
        await check();
        expect(received).toHaveLength(1);
        expect(received[0].body).toMatchObject({ status: 'error', error: 'connection refused' });
    });

    it('records a failing receiver without failing the check', async () => {
        respondWith = 500;
        drift('phone');
        const res = await check();
        expect(res.statusCode).toBe(200);
        expect(res.json().status).toBe('drifted');
        expect(res.json().webhook).toMatch(/failed: HTTP 500/);
    });

    it('records an unreachable receiver', async () => {
        await ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${diagramId}/drift`,
            headers: as(owner),
            payload: { connectionId, webhookUrl: 'http://127.0.0.1:1/hook' },
        });
        drift('phone');
        const res = await check();
        expect(res.json().webhook).toMatch(/failed:/);
    });

    it('refuses to call a private address that is not allow-listed', async () => {
        const strict = await createTestApp({ connectionKey: 'a-long-enough-connection-key' }, { factory }, false);
        try {
            const u = await registerUser(strict.app, 'strict@example.com');
            await grant(strict.app, u, 'editor');
            const id = (await strict.app.inject({ method: 'POST', url: '/diagrams', headers: as(u), payload: { ...diagramFixture, projectId: await projectFor(strict.app) } })).json().id;
            const cid = (
                await strict.app.inject({ method: 'POST', url: '/introspect/connections', headers: as(u), payload: { ...conn(), projectId: await projectFor(strict.app), name: 'c-strict' } })
            ).json().id;
            await strict.app.inject({
                method: 'PUT',
                url: `/diagrams/${id}/drift`,
                headers: as(u),
                payload: { connectionId: cid, webhookUrl: `http://127.0.0.1:${port}/hook` },
            });
            drift('phone');
            const res = await strict.app.inject({ method: 'POST', url: `/diagrams/${id}/drift/check`, headers: as(u) });
            expect(res.json().webhook).toMatch(/blocked/);
            expect(received).toHaveLength(0);
        } finally {
            await strict.close();
        }
    });

    it('limits the payload to the first 50 changes', async () => {
        for (let i = 0; i < 60; i++) drift(`c${i}`);
        await check();
        expect((received[0].body.changes as unknown[]).length).toBe(50);
    });
});
