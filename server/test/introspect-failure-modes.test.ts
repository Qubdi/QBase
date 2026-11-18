import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { savedConnections } from '../src/db/schema.js';
import { UnsafeSqlError } from '../src/introspect/readonly-guard.js';
import { PrivilegedLoginError } from '../src/introspect/sqlserver.js';
import type {
    ConnectionParams,
    DatabaseMetadata,
    IntrospectorFactory,
} from '../src/introspect/types.js';
import {
    as,
    createTestApp,
    grant,
    projectFor,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

const KEY = 'a-long-enough-connection-key';
const OTHER_KEY = 'another-long-enough-connection-key';
const PASSWORD = 'p@ss-w0rd-SECRET';

const emptyMeta = (): DatabaseMetadata => ({
    database_name: 'fake',
    version: 'fake 1',
    tables: [],
    views: [],
    columns: [],
    pk_info: [],
    indexes: [],
    fk_info: [],
});

/** What the fake driver does next, and what it was asked to do. */
interface Script {
    connectError?: Error;
    queryError?: Error;
    opened: ConnectionParams[];
    closed: number;
}

const scriptedFactory =
    (script: Script): IntrospectorFactory =>
    async (params) => {
        if (script.connectError) throw script.connectError;
        script.opened.push(params);
        const run = async <T>(value: T) => {
            if (script.queryError) throw script.queryError;
            return value;
        };
        return {
            catalog: () => run([{ schema: 'public', tables: [], views: [] }]),
            introspect: () => run(emptyMeta()),
            close: async () => {
                script.closed++;
            },
        };
    };

const lookup = async () => [{ address: '93.184.216.34', family: 4 }];

const conn = (over: object = {}) => ({
    dialect: 'postgresql',
    host: '93.184.216.34',
    database: 'shop',
    user: 'reader',
    password: PASSWORD,
    ssl: false,
    ...over,
});

// How the introspection routes fail: what the caller is told and what is kept
// from them, when the driver refuses, the catalog guard trips, or a saved
// password cannot be opened.
describe('introspection failure modes', () => {
    let ctx: TestCtx;
    let script: Script;
    let editor: TestUser;
    let projectId: string;
    let savedId: string;

    const post = (url: string, payload: object, app = ctx.app) =>
        app.inject({ method: 'POST', url, headers: as(editor), payload });

    beforeAll(async () => {
        script = { opened: [], closed: 0 };
        ctx = await createTestApp(
            { connectionKey: KEY },
            { factory: scriptedFactory(script), lookup }
        );
        await registerUser(ctx.app, 'admin@example.com');
        editor = await registerUser(ctx.app, 'editor@example.com');
        await grant(ctx.app, editor, 'editor');
        projectId = await projectFor(ctx.app);
        const saved = await post('/introspect/connections', {
            ...conn(),
            name: 'prod',
            projectId,
        });
        expect(saved.statusCode).toBe(201);
        savedId = saved.json().id;
    });
    afterAll(() => ctx.close());
    beforeEach(() => {
        script.connectError = undefined;
        script.queryError = undefined;
        script.opened.length = 0;
        script.closed = 0;
    });

    describe('errors from the database', () => {
        it('tells the caller a privileged SQL Server login was refused', async () => {
            script.connectError = new PrivilegedLoginError();
            const res = await post('/introspect/catalog', {
                connection: conn({ dialect: 'sqlserver' }),
            });
            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({ error: 'privileged_login' });
        });

        it('answers a read-only guard refusal as an internal error, without the SQL', async () => {
            script.queryError = new UnsafeSqlError('statement "DROP TABLE users" is a write');
            const res = await post('/introspect', { connection: conn() });
            expect(res.statusCode).toBe(500);
            expect(res.json()).toEqual({ error: 'internal_error' });
            expect(res.body).not.toContain('DROP');
            // the connection that was opened is still closed
            expect(script.opened).toHaveLength(1);
            expect(script.closed).toBe(1);
        });

        it('closes the connection when a query fails, and hides the driver text', async () => {
            script.queryError = new Error(`relation "secret_table" failed for ${PASSWORD}`);
            const res = await post('/introspect/catalog', { connection: conn() });
            expect(res.statusCode).toBe(502);
            expect(res.json()).toEqual({ error: 'connection_failed' });
            expect(res.body).not.toContain('secret_table');
            expect(res.body).not.toContain(PASSWORD);
            expect(script.closed).toBe(1);
        });
    });

    describe('a saved connection whose password cannot be opened', () => {
        it('asks for the key when the server has none, unless a password is sent', async () => {
            const bare = await createTestApp(
                { connectionKey: null, secretsKey: null },
                { factory: scriptedFactory(script), lookup },
                false
            );
            try {
                const res = await post('/introspect/catalog', { savedConnectionId: savedId }, bare.app);
                expect(res.statusCode).toBe(501);
                expect(res.json().error).toBe('encryption_not_configured');
                expect(script.opened).toHaveLength(0);
                // a typed password does not need the key
                const typed = await post(
                    '/introspect/catalog',
                    { savedConnectionId: savedId, password: 'typed-in' },
                    bare.app
                );
                expect(typed.statusCode).toBe(200);
                expect(script.opened[0].password).toBe('typed-in');
                expect(script.opened[0].host).toBe('93.184.216.34');
            } finally {
                await bare.close();
            }
        });

        it('says the key changed, and connects nowhere', async () => {
            const rekeyed = await createTestApp(
                { connectionKey: OTHER_KEY, secretsKey: OTHER_KEY },
                { factory: scriptedFactory(script), lookup },
                false
            );
            try {
                const res = await post('/introspect', { savedConnectionId: savedId }, rekeyed.app);
                expect(res.statusCode).toBe(409);
                expect(res.json()).toEqual({ error: 'connection_key_changed' });
                expect(script.opened).toHaveLength(0);
            } finally {
                await rekeyed.close();
            }
        });

        it('does not open a password copied from another saved connection', async () => {
            // a second connection, pointing at another host, gets the first
            // one's sealed password: it is bound to the first connection's id
            const other = await post('/introspect/connections', {
                ...conn({ host: '93.184.216.35', password: 'its-own-password' }),
                name: 'staging',
                projectId,
            });
            expect(other.statusCode).toBe(201);
            const [sealed] = await ctx.db
                .select({ passwordEnc: savedConnections.passwordEnc })
                .from(savedConnections)
                .where(eq(savedConnections.id, savedId));
            await ctx.db
                .update(savedConnections)
                .set({ passwordEnc: sealed.passwordEnc })
                .where(eq(savedConnections.id, other.json().id));
            const res = await post('/introspect/catalog', { savedConnectionId: other.json().id });
            expect(res.statusCode).toBe(409);
            expect(res.json().error).toBe('connection_key_changed');
            expect(script.opened).toHaveLength(0);
            // the original still works with its own sealed password
            const original = await post('/introspect/catalog', { savedConnectionId: savedId });
            expect(original.statusCode).toBe(200);
            expect(script.opened[0].password).toBe(PASSWORD);
        });
    });

    describe('input', () => {
        it('uses the typed connection, checked as one, when a body names both', async () => {
            // the union takes the first shape that fits; extra keys are dropped,
            // so the typed connection is what is used, by a writer
            const res = await post('/introspect/catalog', {
                connection: conn(),
                savedConnectionId: savedId,
            });
            expect(res.statusCode).toBe(200);
            expect(script.opened[0].password).toBe(PASSWORD);
        });

        it.each([
            ['an unknown dialect', { connection: conn({ dialect: 'mysql' }) }],
            ['a port out of range', { connection: conn({ port: 70000 }) }],
            ['a blank host', { connection: conn({ host: '   ' }) }],
            ['a saved id that is not a uuid', { savedConnectionId: 'prod' }],
            ['nothing at all', {}],
            ['too many schemas', { connection: conn(), schemas: Array(201).fill('s') }],
        ])('answers 400 to %s, without connecting', async (_name, body) => {
            const url = 'schemas' in body ? '/introspect' : '/introspect/catalog';
            const res = await post(url, body);
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toBe('invalid_request');
            expect(script.opened).toHaveLength(0);
        });
    });
});
