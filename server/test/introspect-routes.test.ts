import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, savedConnections } from '../src/db/schema.js';
import { CryptoBox } from '../src/introspect/crypto-box.js';
import { defaultIntrospectorFactory } from '../src/introspect/routes.js';
import type {
    ConnectionParams,
    DatabaseMetadata,
    Introspector,
    IntrospectorFactory,
} from '../src/introspect/types.js';
import { resetSampleDatabase, SAMPLE_DB } from './introspect-pg-fixture.js';
import {
    as,
    registerUser,
    createTestApp,
    grant,
    projectFor,
    type TestCtx,
    type TestUser,
} from './helpers.js';

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
        await grant(ctx.app, bob, 'editor');
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

    it('keeps inline connections for people who may write in a project', async () => {
        const viewer = await registerUser(ctx.app, 'inline-viewer@example.com');
        await grant(ctx.app, viewer, 'viewer');
        const nobody = await registerUser(ctx.app, 'inline-nobody@example.com');
        const before = calls.length;
        for (const who of [viewer, nobody]) {
            for (const url of ['/introspect/catalog', '/introspect']) {
                const res = await post(who, url, { connection: conn() });
                expect(res.statusCode, `${who.email} ${url}`).toBe(403);
            }
        }
        // nothing was opened for them
        expect(calls.length).toBe(before);
        expect((await post(bob, '/introspect/catalog', { connection: conn() })).statusCode).toBe(200);
        expect((await post(alice, '/introspect/catalog', { connection: conn() })).statusCode).toBe(200);
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

    describe('outbound rate limit', () => {
        it('shares one per-user allowance across the connection routes', async () => {
            const calls2: Call[] = [];
            const limited = await createTestApp(
                { outboundRateLimit: 2 },
                { factory: fakeFactory(calls2), lookup: async () => [{ address: '93.184.216.34', family: 4 }] },
                false
            );
            try {
                const send = (u: TestUser, url: string) =>
                    limited.app.inject({
                        method: 'POST',
                        url,
                        headers: as(u),
                        payload: { connection: conn() },
                    });
                expect((await send(alice, '/introspect/catalog')).statusCode).toBe(200);
                expect((await send(alice, '/introspect')).statusCode).toBe(200);
                // third call, other route: same allowance
                expect((await send(alice, '/introspect/catalog')).statusCode).toBe(429);
                // nothing was opened for the refused call
                expect(calls2).toHaveLength(2);
                // another user is unaffected
                expect((await send(bob, '/introspect/catalog')).statusCode).toBe(200);
            } finally {
                await limited.close();
            }
        });
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
                await grant(leaky.app, u, 'editor');
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
            const made = await post(alice, '/introspect/connections', {
                ...conn({ host: '10.0.0.1' }),
                name: 'internal',
                projectId: await projectFor(ctx.app),
            });
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
                await grant(allowed.app, u, 'editor');
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

    describe('saved connections (per project)', () => {
        let savedId: string;
        let projectId: string;
        let otherProjectId: string;
        let carol: TestUser; // viewer in the project
        let dave: TestUser; // editor in another project only

        const save = (u: TestUser, name: string, project = projectId) =>
            post(u, '/introspect/connections', { ...conn(), name, projectId: project });
        const list = (u: TestUser, project = projectId) =>
            ctx.app.inject({ url: `/introspect/connections?projectId=${project}`, headers: as(u) });

        beforeAll(async () => {
            projectId = await projectFor(ctx.app);
            carol = await registerUser(ctx.app, 'carol@example.com');
            await grant(ctx.app, carol, 'viewer');
            dave = await registerUser(ctx.app, 'dave@example.com');
            const other = await ctx.app.inject({
                method: 'POST',
                url: '/admin/projects',
                headers: as(alice),
                payload: { name: 'Other project' },
            });
            otherProjectId = other.json().id;
            await ctx.app.inject({
                method: 'PUT',
                url: `/admin/projects/${otherProjectId}/members/${dave.id}`,
                headers: as(alice),
                payload: { role: 'editor' },
            });
        });

        it('refuses to save when no encryption key is configured', async () => {
            const nokey = await createTestApp({}, undefined, false);
            try {
                const u = await registerUser(nokey.app, 'nokey@example.com');
                await grant(nokey.app, u, 'editor');
                const res = await nokey.app.inject({
                    method: 'POST',
                    url: '/introspect/connections',
                    headers: as(u),
                    payload: { ...conn(), name: 'x', projectId },
                });
                expect(res.statusCode).toBe(501);
                expect(res.json().error).toBe('encryption_not_configured');
            } finally {
                await nokey.close();
            }
        });

        it('requires a project to save or list connections', async () => {
            const noProject = await post(alice, '/introspect/connections', { ...conn(), name: 'x' });
            expect(noProject.statusCode).toBe(400);
            const noList = await ctx.app.inject({ url: '/introspect/connections', headers: as(alice) });
            expect(noList.statusCode).toBe(400);
        });

        it('saves a connection without ever returning or storing the plaintext password', async () => {
            const res = await save(bob, 'prod replica');
            expect(res.statusCode).toBe(201);
            savedId = res.json().id;
            expect(res.body).not.toContain('p@ss-w0rd-SECRET');
            expect(res.json()).toMatchObject({ name: 'prod replica', host: '93.184.216.34', port: 5432, user: 'reader' });

            const [row] = await ctx.db
                .select()
                .from(savedConnections)
                .where(eq(savedConnections.id, savedId));
            expect(row.projectId).toBe(projectId);
            expect(row.passwordEnc).not.toContain('p@ss-w0rd-SECRET');
            expect(new CryptoBox('a-long-enough-connection-key').decrypt(row.passwordEnc)).toBe('p@ss-w0rd-SECRET');

            const res2 = await list(bob);
            expect(res2.body).not.toContain('p@ss-w0rd-SECRET');
            expect(res2.body).not.toContain('passwordEnc');
            expect(res2.body).not.toContain('password_enc');
            expect(res2.json().map((c: { id: string }) => c.id)).toContain(savedId);
        });

        it('shares a connection with the admin and every editor of the project', async () => {
            const seenByAdmin = await list(alice);
            expect(seenByAdmin.json().map((c: { id: string }) => c.id)).toContain(savedId);
            const res = await post(alice, '/introspect/catalog', { savedConnectionId: savedId });
            expect(res.statusCode).toBe(200);
        });

        it('rejects duplicate names within a project but allows them in another', async () => {
            expect((await save(bob, 'prod replica')).statusCode).toBe(409);
            expect((await save(dave, 'prod replica', otherProjectId)).statusCode).toBe(201);
        });

        it('introspects through a saved connection using the decrypted password', async () => {
            const res = await post(bob, '/introspect', { savedConnectionId: savedId });
            expect(res.statusCode).toBe(200);
            expect(calls.at(-1)!.params.password).toBe('p@ss-w0rd-SECRET');
            expect(calls.at(-1)!.params.database).toBe('shop');
        });

        it('lets a request override the saved password without storing it', async () => {
            await post(bob, '/introspect/catalog', { savedConnectionId: savedId, password: 'other-pass' });
            expect(calls.at(-1)!.params.password).toBe('other-pass');
            const [row] = await ctx.db
                .select()
                .from(savedConnections)
                .where(eq(savedConnections.id, savedId));
            expect(new CryptoBox('a-long-enough-connection-key').decrypt(row.passwordEnc)).toBe('p@ss-w0rd-SECRET');
        });

        it('keeps projects independent: other projects cannot see, use or delete it', async () => {
            // dave only belongs to the other project
            expect((await list(dave)).statusCode).toBe(404);
            expect((await post(dave, '/introspect/catalog', { savedConnectionId: savedId })).statusCode).toBe(404);
            const del = await ctx.app.inject({ method: 'DELETE', url: `/introspect/connections/${savedId}`, headers: as(dave) });
            expect(del.statusCode).toBe(404);
            expect((await save(dave, 'sneaky')).statusCode).toBe(404);
            const own = (await list(dave, otherProjectId)).json();
            expect(own.every((c: { id: string }) => c.id !== savedId)).toBe(true);
        });

        it('does not let viewers list, use, save or delete connections', async () => {
            expect((await list(carol)).statusCode).toBe(403);
            expect((await save(carol, 'viewer-made')).statusCode).toBe(403);
            expect((await post(carol, '/introspect/catalog', { savedConnectionId: savedId })).statusCode).toBe(404);
            const del = await ctx.app.inject({ method: 'DELETE', url: `/introspect/connections/${savedId}`, headers: as(carol) });
            expect(del.statusCode).toBe(403);
        });

        it('keeps a connection when the user who saved it is deleted', async () => {
            const temp = await registerUser(ctx.app, 'temp@example.com');
            await grant(ctx.app, temp, 'editor');
            const made = await save(temp, 'by temp');
            expect(made.statusCode).toBe(201);
            const del = await ctx.app.inject({ method: 'DELETE', url: `/admin/users/${temp.id}`, headers: as(alice) });
            expect(del.statusCode).toBe(204);
            const [row] = await ctx.db
                .select()
                .from(savedConnections)
                .where(eq(savedConnections.id, made.json().id));
            expect(row).toBeDefined();
            expect(row.ownerId).toBeNull();
        });

        it('records creating, changing and deleting a connection in the audit log', async () => {
            const make = await ctx.app.inject({
                method: 'POST',
                url: '/introspect/connections',
                headers: as(bob),
                payload: { ...conn(), name: 'Audited connection', projectId },
            });
            expect(make.statusCode).toBe(201);
            const id = make.json().id as string;
            const change = await ctx.app.inject({
                method: 'PUT',
                url: `/introspect/connections/${id}`,
                headers: as(bob),
                payload: { ...conn(), password: undefined, name: 'Audited connection' },
            });
            expect(change.statusCode).toBe(200);
            const gone = await ctx.app.inject({
                method: 'DELETE',
                url: `/introspect/connections/${id}`,
                headers: as(bob),
            });
            expect(gone.statusCode).toBe(204);
            const rows = (await ctx.db.select().from(auditLog)).filter((r) =>
                r.action.startsWith('connection.')
            );
            const mine = rows.filter(
                (r) =>
                    r.userId === bob.id &&
                    (r.meta as { name?: string } | null)?.name ===
                        'Audited connection'
            );
            expect(mine.map((r) => r.action)).toEqual([
                'connection.create',
                'connection.update',
                'connection.delete',
            ]);
            for (const r of mine) {
                expect(r.meta).toEqual({
                    projectId,
                    name: 'Audited connection',
                });
                // never the password or host
                expect(JSON.stringify(r.meta)).not.toContain(conn().password);
            }
        });

        describe('editing', () => {
            let editId: string;
            const edit = (u: TestUser, id: string, payload: object) =>
                ctx.app.inject({
                    method: 'PUT',
                    url: `/introspect/connections/${id}`,
                    headers: as(u),
                    payload,
                });
            const withoutPassword = (over: object = {}) => {
                const body: Record<string, unknown> = { ...conn(), ...over };
                delete body.password;
                return body;
            };
            const storedPassword = async (id: string) => {
                const [row] = await ctx.db
                    .select()
                    .from(savedConnections)
                    .where(eq(savedConnections.id, id));
                return new CryptoBox('a-long-enough-connection-key').decrypt(row.passwordEnc);
            };

            beforeAll(async () => {
                editId = (await save(bob, 'to edit')).json().id;
            });

            it('changes the settings and keeps the saved password when none is sent', async () => {
                const res = await edit(
                    bob,
                    editId,
                    withoutPassword({ name: 'renamed' })
                );
                expect(res.statusCode).toBe(200);
                expect(res.json()).toMatchObject({ id: editId, name: 'renamed' });
                expect(res.body).not.toContain('p@ss-w0rd-SECRET');
                expect(await storedPassword(editId)).toBe('p@ss-w0rd-SECRET');
            });

            it('needs the password typed again to point the connection somewhere else', async () => {
                const before = await storedPassword(editId);
                for (const move of [
                    { host: '93.184.216.35' },
                    { port: 5433 },
                    { dialect: 'sqlserver' },
                    { database: 'another_database' },
                    { user: 'another_user' },
                    { ssl: true },
                    { trustServerCertificate: true },
                ]) {
                    const res = await edit(bob, editId, withoutPassword({ name: 'renamed', ...move }));
                    expect(res.statusCode, JSON.stringify(move)).toBe(400);
                    expect(res.json().error).toBe('password_required');
                }
                // nothing moved, and the stored password is untouched
                const [row] = await ctx.db
                    .select()
                    .from(savedConnections)
                    .where(eq(savedConnections.id, editId));
                expect(row.host).toBe(conn().host);
                expect(await storedPassword(editId)).toBe(before);

                // the same host in another case, or the default port written out, is not a move
                const same = await edit(
                    bob,
                    editId,
                    withoutPassword({ name: 'renamed', host: conn().host.toUpperCase(), port: 5432 })
                );
                expect(same.statusCode).toBe(200);

                // with the password it may move; the new target is checked as usual
                const moved = await edit(bob, editId, {
                    ...conn(),
                    name: 'renamed',
                    host: '93.184.216.35',
                    password: 'typed-again',
                });
                expect(moved.statusCode).toBe(200);
                expect(moved.json().host).toBe('93.184.216.35');
                // put it back for the tests that follow
                const back = await edit(bob, editId, { ...conn(), name: 'renamed', password: 'p@ss-w0rd-SECRET' });
                expect(back.statusCode).toBe(200);
            });

            it('replaces the password when a new one is sent, and never returns it', async () => {
                const res = await edit(bob, editId, { ...conn(), name: 'renamed', password: 'brand-new-pass' });
                expect(res.statusCode).toBe(200);
                expect(res.body).not.toContain('brand-new-pass');
                expect(await storedPassword(editId)).toBe('brand-new-pass');
            });

            it('fills in the default port for the dialect', async () => {
                const res = await edit(bob, editId, withoutPassword({ name: 'renamed', port: undefined }));
                expect(res.json().port).toBe(5432);
            });

            it('rejects a name another connection of the project already uses, but not its own', async () => {
                expect((await edit(bob, editId, withoutPassword({ name: 'prod replica' }))).statusCode).toBe(409);
                expect((await edit(bob, editId, withoutPassword({ name: 'renamed' }))).statusCode).toBe(200);
            });

            it('validates what it is given', async () => {
                expect((await edit(bob, editId, withoutPassword({ host: '' }))).statusCode).toBe(400);
                expect((await edit(bob, editId, withoutPassword({ name: '  ' }))).statusCode).toBe(400);
            });

            it('is for the project editors only', async () => {
                const body = withoutPassword({ name: 'renamed' });
                expect((await edit(carol, editId, body)).statusCode).toBe(403);
                expect((await edit(dave, editId, body)).statusCode).toBe(404);
                expect(
                    (await edit(bob, '00000000-0000-4000-8000-000000000000', body)).statusCode
                ).toBe(404);
            });

            it('needs the encryption key only to change the password', async () => {
                const nokey = await createTestApp({}, undefined, false);
                try {
                    const u = await registerUser(nokey.app, 'nokey-edit@example.com');
                    await grant(nokey.app, u, 'editor');
                    const put = (payload: object) =>
                        nokey.app.inject({
                            method: 'PUT',
                            url: `/introspect/connections/${editId}`,
                            headers: as(u),
                            payload,
                        });
                    const withPassword = await put({ ...conn(), name: 'renamed', password: 'x' });
                    expect(withPassword.statusCode).toBe(501);
                    expect(withPassword.json().error).toBe('encryption_not_configured');
                    expect((await put(withoutPassword({ name: 'renamed' }))).statusCode).toBe(200);
                } finally {
                    await nokey.close();
                }
            });
        });

        describe('capabilities', () => {
            it('says saved connections work when the server has an encryption key', async () => {
                const res = await ctx.app.inject({ url: '/introspect/capabilities', headers: as(bob) });
                expect(res.statusCode).toBe(200);
                expect(res.json()).toEqual({ savedConnections: true });
            });

            it('says they do not when it has none', async () => {
                const nokey = await createTestApp({}, undefined, false);
                try {
                    const u = await registerUser(nokey.app, 'nokey-cap@example.com');
                    const res = await nokey.app.inject({ url: '/introspect/capabilities', headers: as(u) });
                    expect(res.json()).toEqual({ savedConnections: false });
                } finally {
                    await nokey.close();
                }
            });

            it('needs a login', async () => {
                const res = await ctx.app.inject({ url: '/introspect/capabilities' });
                expect(res.statusCode).toBe(401);
            });
        });

        it('deletes a saved connection', async () => {
            const del = await ctx.app.inject({ method: 'DELETE', url: `/introspect/connections/${savedId}`, headers: as(bob) });
            expect(del.statusCode).toBe(204);
            expect((await post(bob, '/introspect/catalog', { savedConnectionId: savedId })).statusCode).toBe(404);
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
            await grant(blocked.app, u, 'editor');
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
