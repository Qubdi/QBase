import http from 'node:http';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, driftReports, driftSettings } from '../src/db/schema.js';
import {
    CLAIM_LEASE_MS,
    claimDueChecks,
    runDueChecks,
} from '../src/drift/service.js';
import type {
    DatabaseMetadata,
    Introspector,
    IntrospectorFactory,
} from '../src/introspect/types.js';
import diagramFixture from './fixtures/postgres-diagram.json' with { type: 'json' };
import metadataFixture from './fixtures/postgres-metadata.json' with { type: 'json' };
import { loadConfig } from '../src/config.js';
import {
    as,
    createTestApp,
    registerUser,
    type TestCtx,
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
        enabled: true,
        schedule: '0 3 * * *',
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
        it('starts unconfigured and is off by default', async () => {
            const res = await get();
            expect(res.json()).toEqual({ settings: null, latest: null, badge: null });
        });

        it('saves settings and schedules the next run only when enabled', async () => {
            const on = await put(owner, settings({ schedule: '*/10 * * * *' }));
            expect(on.statusCode).toBe(200);
            expect(on.json()).toMatchObject({ enabled: true, schedule: '*/10 * * * *' });
            expect(on.json().nextRunAt).toBeTruthy();
            const off = await put(owner, settings({ enabled: false }));
            expect(off.json().enabled).toBe(false);
            expect(off.json().nextRunAt).toBeNull();
        });

        it('rejects bad schedules, webhooks and connections', async () => {
            expect((await put(owner, settings({ schedule: 'every day' }))).json().error).toBe('invalid_schedule');
            expect((await put(owner, settings({ schedule: '* * *' }))).statusCode).toBe(400);
            expect((await put(owner, settings({ webhookUrl: 'ftp://x.example.com' }))).json().error).toBe('invalid_webhook');
            expect((await put(owner, settings({ webhookUrl: 'not a url' }))).statusCode).toBe(400);
            expect((await put(owner, settings({ webhookUrl: 'https://user:pw@x.example.com/h' }))).statusCode).toBe(400);
            expect((await put(owner, settings({ connectionId: null }))).json().error).toBe('connection_required');
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

        it('allows saving a disabled configuration without a connection', async () => {
            const res = await put(owner, settings({ enabled: false, connectionId: null }));
            expect(res.statusCode).toBe(200);
        });

        it('does not run a check before it is configured', async () => {
            const res = await check();
            expect(res.statusCode).toBe(409);
            expect(res.json().error).toBe('not_configured');
        });
    });

    describe('what a check finds', () => {
        beforeEach(async () => {
            expect((await put(owner, settings({ enabled: false }))).statusCode).toBe(200);
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
            await put(owner, settings({ enabled: false, tables: ['public.customers', 'shop.order_items', 'shop.orders', 'shop.paid_orders'] }));
            meta.tables.push({ schema: 'shop', table: 'extra', type: 'BASE TABLE' });
            expect((await check()).json().status).toBe('clean');
            // without a selection the same table is reported
            await put(owner, settings({ enabled: false, tables: [] }));
            const body = (await check()).json();
            expect(body.changes.map((c: { id: string }) => c.id)).toEqual(['table_added:shop.extra']);
        });

        it('keeps a locally renamed table matched through the stored source identity', async () => {
            const content = clone(diagramFixture.content) as { tables: Array<{ id: string; name: string }> };
            const customers = content.tables.find((t) => t.name === 'customers')!;
            customers.name = 'clients';
            await ctx.app.inject({ method: 'PUT', url: `/diagrams/${diagramId}`, headers: as(owner), payload: { content } });
            try {
                const without = (await check()).json();
                expect(without.status).toBe('drifted');
                await put(owner, settings({ enabled: false, sourceKeys: { tables: { [customers.id]: 'public.customers' }, columns: {} } }));
                const withKeys = (await check()).json();
                expect(withKeys.status).toBe('clean');
            } finally {
                await ctx.app.inject({ method: 'PUT', url: `/diagrams/${diagramId}`, headers: as(owner), payload: { ...diagramFixture, projectId: await projectFor(ctx.app) } });
            }
        });
    });

    describe('failures are errors, not drift', () => {
        beforeEach(async () => {
            expect((await put(owner, settings({ enabled: false }))).statusCode).toBe(200);
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

        it('reports a blocked target as an error', async () => {
            await ctx.db.update((await import('../src/db/schema.js')).savedConnections).set({ host: '10.0.0.5' });
            const body = (await check()).json();
            expect(body.status).toBe('error');
            expect(body.error).toMatch(/blocked/);
            expect(factoryCalls).toBe(0);
            await ctx.db.update((await import('../src/db/schema.js')).savedConnections).set({ host: '93.184.216.34' });
        });

        it('reports a deleted connection as an error', async () => {
            const tmp = await ctx.app.inject({
                method: 'POST',
                url: '/introspect/connections',
                headers: as(owner),
                payload: { ...conn(), projectId: await projectFor(ctx.app), name: 'temp' },
            });
            await put(owner, settings({ enabled: false, connectionId: tmp.json().id }));
            await ctx.app.inject({ method: 'DELETE', url: `/introspect/connections/${tmp.json().id}`, headers: as(owner) });
            const body = (await check()).json();
            expect(body.status).toBe('error');
            expect(body.error).toMatch(/connection/i);
            expect((await get()).json().settings.connectionId).toBeNull();
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
            await put(owner, settings({ enabled: false }));
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
            await put(owner, settings({ enabled: false }));
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
            await put(owner, settings({ enabled: false }), tmp);
            await check(owner, tmp);
            await ctx.app.inject({ method: 'DELETE', url: `/diagrams/${tmp}`, headers: as(owner) });
            expect(await ctx.db.select().from(driftReports).where(eq(driftReports.diagramId, tmp))).toHaveLength(0);
            expect(await ctx.db.select().from(driftSettings).where(eq(driftSettings.diagramId, tmp))).toHaveLength(0);
        });
    });

    describe('concurrency', () => {
        it('does not run two checks of one diagram at once', async () => {
            await put(owner, settings({ enabled: false }));
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
            payload: { enabled: false, schedule: '0 3 * * *', connectionId, webhookUrl: `http://127.0.0.1:${port}/hook` },
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
            event: 'qubdidb.drift',
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
            payload: { enabled: false, schedule: '0 3 * * *', connectionId, webhookUrl: 'http://127.0.0.1:1/hook' },
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
                payload: { enabled: false, schedule: '0 3 * * *', connectionId: cid, webhookUrl: `http://127.0.0.1:${port}/hook` },
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

describe('drift scheduler', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    const ids: string[] = [];

    beforeAll(async () => {
        ctx = await createTestApp({ connectionKey: 'a-long-enough-connection-key' }, { factory });
        owner = await registerUser(ctx.app, 'sched@example.com');
        for (let i = 0; i < 3; i++) {
            ids.push((await ctx.app.inject({ method: 'POST', url: '/diagrams', headers: as(owner), payload: { ...diagramFixture, projectId: await projectFor(ctx.app) } })).json().id);
        }
    });
    afterAll(() => ctx.close());
    beforeEach(async () => {
        meta = clone(base);
        factoryError = null;
        factoryCalls = 0;
        await ctx.db.delete(driftReports);
        await ctx.db.delete(driftSettings);
    });

    const deps = () => ({
        db: ctx.db,
        config: {
            ...loadConfig({ LOG_LEVEL: 'silent' }),
            connectionKey: 'a-long-enough-connection-key',
        },
        factory,
    });
    const configure = async (diagramId: string, over: object = {}) => {
        const cid = (
            await ctx.app.inject({ method: 'POST', url: '/introspect/connections', headers: as(owner), payload: { ...conn(), projectId: await projectFor(ctx.app), name: `c-${diagramId.slice(0, 6)}-${Math.random()}` } })
        ).json().id;
        const res = await ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${diagramId}/drift`,
            headers: as(owner),
            payload: { enabled: true, schedule: '0 3 * * *', connectionId: cid, ...over },
        });
        expect(res.statusCode).toBe(200);
    };
    const setNext = (diagramId: string, when: Date | null) =>
        ctx.db.update(driftSettings).set({ nextRunAt: when }).where(eq(driftSettings.diagramId, diagramId));
    const reports = async (diagramId: string) =>
        ctx.db.select().from(driftReports).where(eq(driftReports.diagramId, diagramId));

    it('runs only enabled checks whose time has come', async () => {
        await configure(ids[0]);
        await configure(ids[1]);
        await configure(ids[2], { enabled: false });
        const now = new Date('2026-03-10T12:00:00Z');
        await setNext(ids[0], new Date('2026-03-10T11:59:00Z')); // due
        await setNext(ids[1], new Date('2026-03-10T12:01:00Z')); // not yet
        const ran = await runDueChecks(deps(), now);
        expect(ran).toBe(1);
        expect(await reports(ids[0])).toHaveLength(1);
        expect(await reports(ids[1])).toHaveLength(0);
        expect(await reports(ids[2])).toHaveLength(0);
        expect((await reports(ids[0]))[0].trigger).toBe('schedule');
    });

    it('treats a missing next-run time as due and then schedules the next run', async () => {
        await configure(ids[0], { schedule: '*/30 * * * *' });
        await setNext(ids[0], null);
        const now = new Date('2026-03-10T12:07:00Z');
        expect(await runDueChecks(deps(), now)).toBe(1);
        const [s] = await ctx.db.select().from(driftSettings).where(eq(driftSettings.diagramId, ids[0]));
        expect(s.nextRunAt?.toISOString()).toBe('2026-03-10T12:30:00.000Z');
        // nothing is due again until then
        expect(await runDueChecks(deps(), new Date('2026-03-10T12:20:00Z'))).toBe(0);
    });

    it('runs the check at its scheduled time and finds drift', async () => {
        await configure(ids[0]);
        await setNext(ids[0], new Date('2026-03-10T03:00:00Z'));
        meta.columns.push({ schema: 'public', table: 'customers', name: 'phone', type: 'text', ordinal_position: 99, nullable: true } as DatabaseMetadata['columns'][number]);
        await runDueChecks(deps(), new Date('2026-03-10T03:00:10Z'));
        const [r] = await reports(ids[0]);
        expect(r.status).toBe('drifted');
    });

    it('keeps going when one diagram fails', async () => {
        await configure(ids[0]);
        await configure(ids[1]);
        await setNext(ids[0], new Date(0));
        await setNext(ids[1], new Date(0));
        // the first factory call throws, the second succeeds
        let n = 0;
        const flaky: typeof factory = async (p, t) => {
            if (n++ === 0) throw new Error('first one is down');
            return factory(p, t);
        };
        const ran = await runDueChecks({ ...deps(), factory: flaky }, new Date());
        expect(ran).toBe(2);
        const all = [...(await reports(ids[0])), ...(await reports(ids[1]))];
        expect(all.map((r) => r.status).sort()).toEqual(['clean', 'error']);
    });

    it('does nothing when nothing is configured', async () => {
        expect(await runDueChecks(deps(), new Date())).toBe(0);
    });

    describe('several servers at once', () => {
        it('lets exactly one of two racing schedulers take each due check', async () => {
            for (const id of ids) await configure(id);
            for (const id of ids) await setNext(id, new Date(0));
            const now = new Date('2026-03-10T12:00:00Z');
            const [a, b] = await Promise.all([
                runDueChecks(deps(), now),
                runDueChecks(deps(), now),
            ]);
            // three diagrams were due: each ran once, none twice
            expect(a + b).toBe(3);
            for (const id of ids) expect(await reports(id)).toHaveLength(1);
        });

        it('hides a claimed check from other servers until the lease ends', async () => {
            await configure(ids[0]);
            await setNext(ids[0], new Date(0));
            const now = new Date('2026-03-10T12:00:00Z');
            expect(await claimDueChecks(ctx.db, now)).toEqual([ids[0]]);
            // a second server sees nothing due, even before the check finished
            expect(await claimDueChecks(ctx.db, now)).toEqual([]);
            // the claiming server died: after the lease the check is up again
            const later = new Date(now.getTime() + CLAIM_LEASE_MS + 1000);
            expect(await claimDueChecks(ctx.db, later)).toEqual([ids[0]]);
        });
    });
});
