import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { savedConnections } from '../src/db/schema.js';
import { CryptoBox } from '../src/introspect/crypto-box.js';
import { defaultIntrospectorFactory } from '../src/introspect/routes.js';
import type {
    ConnectionParams,
    DatabaseMetadata,
    Introspector,
    IntrospectorFactory,
} from '../src/introspect/types.js';
import { resetSampleDatabase, SAMPLE_DB } from './introspect-pg-fixture.js';
import { as, registerUser, createTestApp, type TestCtx, type TestUser } from './helpers.js';

const meta = (): DatabaseMetadata => ({
    database_name: 'fake',
    version: 'fake 1',
    tables: [
        { schema: 'public', table: 'a' },
        { schema: 'public', table: 'b' },
        { schema: 'public', table: 'c' },
    ],
    views: [],
    columns: [],
    pk_info: [],
    indexes: [],
    fk_info: [
        { schema: 'public', table: 'b', column: 'a_id', foreign_key_name: 'b_a', reference_schema: 'public', reference_table: 'a', reference_column: 'id', fk_def: '' },
        { schema: 'public', table: 'c', column: 'a_id', foreign_key_name: 'c_a', reference_schema: 'public', reference_table: 'a', reference_column: 'id', fk_def: '' },
    ],
});

interface Call {
    params: ConnectionParams;
    address: string;
    closed: boolean;
}

function fakeFactory(calls: Call[], opts: { failWith?: Error } = {}): IntrospectorFactory {
    return async (params, target) => {
        if (opts.failWith) throw opts.failWith;
        const call: Call = { params, address: target.address, closed: false };
        calls.push(call);
        const intro: Introspector = {
            catalog: async () => [{ schema: 'public', tables: ['a', 'b', 'c'], views: [] }],
            introspect: async () => meta(),
            close: async () => {
                call.closed = true;
            },
        };
        return intro;
    };
}

const conn = (over: object = {}) => ({
    dialect: 'postgresql',
    host: '93.184.216.34', // public literal: no DNS needed
    database: 'shop',
    user: 'reader',
    password: 'p@ss-w0rd-SECRET',
    ...over,
});

describe('introspect HTTP layer (fake driver)', () => {
    let ctx: TestCtx;
    let calls: Call[];
    let alice: TestUser;
    let bob: TestUser;

    const post = (u: TestUser | null, url: string, payload: object) =>
        ctx.app.inject({ method: 'POST', url, headers: u ? as(u) : {}, payload });

    beforeAll(async () => {
        calls = [];
        ctx = await createTestApp(
            { connectionKey: 'a-long-enough-connection-key' },
            { factory: fakeFactory(calls), lookup: async (h) =>
                    h === 'evil.example.com'
                        ? [{ address: '10.0.0.8', family: 4 }]
                        : h === 'localhost'
                          ? [{ address: '127.0.0.1', family: 4 }]
                          : [{ address: '93.184.216.34', family: 4 }] }
        );
        alice = await registerUser(ctx.app, 'alice@example.com');
        bob = await registerUser(ctx.app, 'bob@example.com');
    });
    afterAll(() => ctx.close());

    it('requires login for every endpoint', async () => {
        for (const [method, url] of [
            ['POST', '/introspect'],
            ['POST', '/introspect/catalog'],
            ['GET', '/introspect/connections'],
            ['POST', '/introspect/connections'],
            ['DELETE', '/introspect/connections/00000000-0000-4000-8000-000000000000'],
        ] as const) {
            const res = await ctx.app.inject({ method, url, payload: {} });
            expect(res.statusCode, `${method} ${url}`).toBe(401);
        }
    });

    it('returns the catalog and closes the connection afterwards', async () => {
        const before = calls.length;
        const res = await post(alice, '/introspect/catalog', { connection: conn() });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
            dialect: 'postgresql',
            database: 'shop',
            schemas: [{ schema: 'public', tables: ['a', 'b', 'c'], views: [] }],
        });
        expect(calls.length).toBe(before + 1);
        expect(calls.at(-1)!.closed).toBe(true);
    });

    it('fills in the default port per dialect', async () => {
        await post(alice, '/introspect/catalog', { connection: conn() });
        expect(calls.at(-1)!.params.port).toBe(5432);
        await post(alice, '/introspect/catalog', { connection: conn({ dialect: 'sqlserver' }) });
        expect(calls.at(-1)!.params.port).toBe(1433);
        await post(alice, '/introspect/catalog', { connection: conn({ port: 6543 }) });
        expect(calls.at(-1)!.params.port).toBe(6543);
    });

    it('returns metadata, honouring the table selection and dropping dangling foreign keys', async () => {
        const all = await post(alice, '/introspect', { connection: conn() });
        expect(all.json().metadata.tables).toHaveLength(3);

        const some = await post(alice, '/introspect', {
            connection: conn(),
            tables: ['public.a', 'public.b'],
        });
        expect(some.json().metadata.tables.map((t: { table: string }) => t.table)).toEqual(['a', 'b']);
        expect(some.json().metadata.fk_info.map((f: { foreign_key_name: string }) => f.foreign_key_name)).toEqual(['b_a']);
    });

    it('validates input', async () => {
        for (const bad of [
            {},
            { connection: conn({ dialect: 'oracle' }) },
            { connection: conn({ host: '' }) },
            { connection: conn({ port: 70000 }) },
            { connection: conn({ database: undefined }) },
            { savedConnectionId: 'not-a-uuid' },
        ]) {
            const res = await post(alice, '/introspect/catalog', bad);
            expect(res.statusCode, JSON.stringify(bad)).toBe(400);
        }
    });

    describe('credentials are used for the request only', () => {
        it('stores nothing when a connection is used without saving', async () => {
            await post(alice, '/introspect', { connection: conn() });
            const saved = await ctx.db.select().from(savedConnections);
            expect(saved).toHaveLength(0);
        });

        it('never echoes the password, even when the driver error contains it', async () => {
            const leaky = await createTestApp(
                {},
                {
                    factory: fakeFactory([], {
                        failWith: new Error('login failed for user reader password=p@ss-w0rd-SECRET'),
                    }),
                },
                false
            );
            try {
                const u = await registerUser(leaky.app, 'leaky@example.com');
                const res = await leaky.app.inject({
                    method: 'POST',
                    url: '/introspect/catalog',
                    headers: as(u),
                    payload: { connection: conn() },
                });
                expect(res.statusCode).toBe(502);
                expect(res.json().error).toBe('connection_failed');
                expect(res.body).not.toContain('p@ss-w0rd-SECRET');
                expect(res.body).toContain('***');
            } finally {
                await leaky.close();
            }
        });
    });

    describe('SSRF protection', () => {
        it('blocks loopback, private, link-local and metadata targets without connecting', async () => {
            const before = calls.length;
            for (const host of ['127.0.0.1', 'localhost', '10.1.2.3', '192.168.0.5', '169.254.169.254', '[::1]', '::1', 'fd00::1', '0.0.0.0']) {
                const res = await post(alice, '/introspect/catalog', { connection: conn({ host }) });
                expect(res.statusCode, host).toBe(400);
                expect(res.json().error, host).toBe('target_blocked');
            }
            expect(calls.length).toBe(before);
        });

        it('blocks a hostname that resolves to a private address', async () => {
            const before = calls.length;
            const res = await post(alice, '/introspect/catalog', { connection: conn({ host: 'evil.example.com' }) });
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toBe('target_blocked');
            expect(calls.length).toBe(before);
        });

        it('connects to the vetted address, not the name', async () => {
            await post(alice, '/introspect/catalog', { connection: conn({ host: 'db.example.com' }) });
            expect(calls.at(-1)!.address).toBe('93.184.216.34');
            expect(calls.at(-1)!.params.host).toBe('db.example.com');
        });

        it('applies to /introspect and to saved connections too', async () => {
            const res = await post(alice, '/introspect', { connection: conn({ host: '10.0.0.1' }) });
            expect(res.statusCode).toBe(400);
            const made = await post(alice, '/introspect/connections', { ...conn({ host: '10.0.0.1' }), name: 'internal' });
            expect(made.statusCode).toBe(201); // saving is allowed; using it is what is blocked
            const used = await post(alice, '/introspect/catalog', { savedConnectionId: made.json().id });
            expect(used.statusCode).toBe(400);
            expect(used.json().error).toBe('target_blocked');
            await ctx.app.inject({
                method: 'DELETE',
                url: `/introspect/connections/${made.json().id}`,
                headers: as(alice),
            });
        });

        it('lets an administrator allow-list a private target', async () => {
            const calls2: Call[] = [];
            const allowed = await createTestApp(
                { introspectAllowHosts: ['10.0.0.0/8'] },
                { factory: fakeFactory(calls2) },
                false
            );
            try {
                const u = await registerUser(allowed.app, 'allowed@example.com');
                const res = await allowed.app.inject({
                    method: 'POST',
                    url: '/introspect/catalog',
                    headers: as(u),
                    payload: { connection: conn({ host: '10.9.9.9' }) },
                });
                expect(res.statusCode).toBe(200);
                expect(calls2.at(-1)!.address).toBe('10.9.9.9');
                const other = await allowed.app.inject({
                    method: 'POST',
                    url: '/introspect/catalog',
                    headers: as(u),
                    payload: { connection: conn({ host: '192.168.1.1' }) },
                });
                expect(other.statusCode).toBe(400);
            } finally {
                await allowed.close();
            }
        });
    });

    describe('saved connections', () => {
        let savedId: string;

        it('refuses to save when no encryption key is configured', async () => {
            const nokey = await createTestApp({}, undefined, false);
            try {
                const u = await registerUser(nokey.app, 'nokey@example.com');
                const res = await nokey.app.inject({
                    method: 'POST',
                    url: '/introspect/connections',
                    headers: as(u),
                    payload: { ...conn(), name: 'x' },
                });
                expect(res.statusCode).toBe(501);
                expect(res.json().error).toBe('encryption_not_configured');
            } finally {
                await nokey.close();
            }
        });

        it('saves a connection without ever returning or storing the plaintext password', async () => {
            const res = await post(alice, '/introspect/connections', { ...conn(), name: 'prod replica' });
            expect(res.statusCode).toBe(201);
            savedId = res.json().id;
            expect(res.body).not.toContain('p@ss-w0rd-SECRET');
            expect(res.json()).toMatchObject({ name: 'prod replica', host: '93.184.216.34', port: 5432, user: 'reader' });

            const [row] = await ctx.db
                .select()
                .from(savedConnections)
                .where(eq(savedConnections.id, savedId));
            expect(row.passwordEnc).not.toContain('p@ss-w0rd-SECRET');
            expect(new CryptoBox('a-long-enough-connection-key').decrypt(row.passwordEnc)).toBe('p@ss-w0rd-SECRET');

            const list = await ctx.app.inject({ url: '/introspect/connections', headers: as(alice) });
            expect(list.body).not.toContain('p@ss-w0rd-SECRET');
            expect(list.body).not.toContain('passwordEnc');
            expect(list.body).not.toContain('password_enc');
            expect(list.json()).toHaveLength(1);
        });

        it('rejects duplicate names per user but allows the same name for another user', async () => {
            expect((await post(alice, '/introspect/connections', { ...conn(), name: 'prod replica' })).statusCode).toBe(409);
            expect((await post(bob, '/introspect/connections', { ...conn(), name: 'prod replica' })).statusCode).toBe(201);
        });

        it('introspects through a saved connection using the decrypted password', async () => {
            const res = await post(alice, '/introspect', { savedConnectionId: savedId });
            expect(res.statusCode).toBe(200);
            expect(calls.at(-1)!.params.password).toBe('p@ss-w0rd-SECRET');
            expect(calls.at(-1)!.params.database).toBe('shop');
        });

        it('lets a request override the saved password without storing it', async () => {
            await post(alice, '/introspect/catalog', { savedConnectionId: savedId, password: 'other-pass' });
            expect(calls.at(-1)!.params.password).toBe('other-pass');
            const [row] = await ctx.db
                .select()
                .from(savedConnections)
                .where(eq(savedConnections.id, savedId));
            expect(new CryptoBox('a-long-enough-connection-key').decrypt(row.passwordEnc)).toBe('p@ss-w0rd-SECRET');
        });

        it("keeps users' saved connections private", async () => {
            const bobList = (await ctx.app.inject({ url: '/introspect/connections', headers: as(bob) })).json();
            expect(bobList.every((c: { id: string }) => c.id !== savedId)).toBe(true);
            const use = await post(bob, '/introspect/catalog', { savedConnectionId: savedId });
            expect(use.statusCode).toBe(404);
            const del = await ctx.app.inject({ method: 'DELETE', url: `/introspect/connections/${savedId}`, headers: as(bob) });
            expect(del.statusCode).toBe(404);
        });

        it('deletes a saved connection', async () => {
            const del = await ctx.app.inject({ method: 'DELETE', url: `/introspect/connections/${savedId}`, headers: as(alice) });
            expect(del.statusCode).toBe(204);
            expect((await post(alice, '/introspect/catalog', { savedConnectionId: savedId })).statusCode).toBe(404);
        });

        it('404s for an unknown saved connection', async () => {
            const res = await post(alice, '/introspect/catalog', { savedConnectionId: '00000000-0000-4000-8000-000000000000' });
            expect(res.statusCode).toBe(404);
        });
    });
});

describe('introspect end to end against the real sample database', () => {
    let ctx: TestCtx;
    let user: TestUser;

    beforeAll(async () => {
        await resetSampleDatabase();
        ctx = await createTestApp(
            { introspectAllowHosts: ['127.0.0.1', '::1'] },
            { factory: defaultIntrospectorFactory }
        );
        user = await registerUser(ctx.app, 'e2e@example.com');
    });
    afterAll(() => ctx.close());

    const real = (over: object = {}) => ({
        dialect: 'postgresql',
        host: '127.0.0.1',
        port: 5433,
        database: SAMPLE_DB,
        user: 'qubdidb',
        password: 'qubdidb',
        ...over,
    });

    it('is blocked by default and works once the host is allow-listed', async () => {
        const blocked = await createTestApp({}, { factory: defaultIntrospectorFactory }, false);
        try {
            const u = await registerUser(blocked.app, 'blocked@example.com');
            const res = await blocked.app.inject({
                method: 'POST',
                url: '/introspect/catalog',
                headers: as(u),
                payload: { connection: real() },
            });
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toBe('target_blocked');
        } finally {
            await blocked.close();
        }
    });

    it('lists the catalog and imports the selected tables with their relationships', async () => {
        const cat = await ctx.app.inject({
            method: 'POST',
            url: '/introspect/catalog',
            headers: as(user),
            payload: { connection: real() },
        });
        expect(cat.statusCode).toBe(200);
        expect(cat.json().schemas.map((s: { schema: string }) => s.schema)).toEqual(['public', 'shop']);

        const res = await ctx.app.inject({
            method: 'POST',
            url: '/introspect',
            headers: as(user),
            payload: { connection: real(), schemas: ['public', 'shop'], tables: ['public.customers', 'shop.orders'] },
        });
        expect(res.statusCode).toBe(200);
        const m = res.json().metadata;
        expect(m.tables.map((t: { table: string }) => t.table).sort()).toEqual(['customers', 'orders']);
        expect(m.fk_info).toHaveLength(1);
        expect(m.fk_info[0].foreign_key_name).toBe('orders_customer_fk');
    });

    it('reports a clear error for wrong credentials without leaking the password', async () => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/introspect/catalog',
            headers: as(user),
            payload: { connection: real({ password: 'definitely-wrong-pw' }) },
        });
        expect(res.statusCode).toBe(502);
        expect(res.body).not.toContain('definitely-wrong-pw');
    });
});
