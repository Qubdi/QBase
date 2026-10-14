import type { FastifyInstance } from 'fastify';
import { buildApp, type AppDeps } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { createDb } from '../src/db/client.js';

export const TEST_DB = 'qubdidb_test';
export const ADMIN_URL =
    'postgres://qubdidb:qubdidb@localhost:5433/postgres';
export const TEST_URL = `postgres://qubdidb:qubdidb@localhost:5433/${TEST_DB}`;

export interface TestCtx {
    app: FastifyInstance;
    db: ReturnType<typeof createDb>['db'];
    close: () => Promise<void>;
}

export async function createTestApp(
    overrides: Partial<Config> = {},
    introspect?: AppDeps['introspect'],
    /** set false to add a second app without wiping the first one's data */
    reset = true
): Promise<TestCtx> {
    const config = {
        ...loadConfig({}),
        databaseUrl: TEST_URL,
        ...overrides,
    };
    const { db, pool } = createDb(TEST_URL);
    if (reset) {
        await pool.query(
        'truncate table audit_log, sessions, diagram_members, diagrams, saved_connections, drift_settings, drift_reports, users restart identity cascade'
        );
    }
    const app = buildApp({ config, db, introspect });
    await app.ready();
    return {
        app,
        db,
        close: async () => {
            await app.close();
            await pool.end();
        },
    };
}

export interface TestUser {
    id: string;
    email: string;
    cookie: string;
}

export async function registerUser(
    app: FastifyInstance,
    email: string,
    password = 'password123'
): Promise<TestUser> {
    const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password },
    });
    if (res.statusCode !== 201) {
        throw new Error(`register failed: ${res.statusCode} ${res.body}`);
    }
    const set = res.cookies.find((c) => c.name === 'qubdidb_session')!;
    return {
        id: res.json().id,
        email,
        cookie: `qubdidb_session=${set.value}`,
    };
}

export const as = (user: TestUser) => ({ cookie: user.cookie });

export const sampleContent = {
    id: 'local-1',
    name: 'Shop',
    databaseType: 'postgresql',
    tables: [],
};

export async function createDiagram(
    app: FastifyInstance,
    user: TestUser,
    title = 'My diagram'
): Promise<string> {
    const res = await app.inject({
        method: 'POST',
        url: '/diagrams',
        headers: as(user),
        payload: { title, content: sampleContent },
    });
    return res.json().id;
}
