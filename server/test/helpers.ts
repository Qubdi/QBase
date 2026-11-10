import type { FastifyInstance } from 'fastify';
import { buildApp, type AppDeps } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import pg from 'pg';
import { createDb } from '../src/db/client.js';

export const TEST_DB = 'qbase_test';
// TEST_PG_PORT points the suite at a throwaway Postgres instead of the one on 5433
const PG_PORT = process.env.TEST_PG_PORT ?? '5433';
// TEST_PG_USER and TEST_PG_PASSWORD replace the default login of that Postgres
const PG_LOGIN = `${encodeURIComponent(process.env.TEST_PG_USER ?? 'qbase')}:${encodeURIComponent(process.env.TEST_PG_PASSWORD ?? 'qbase')}`;
export const ADMIN_URL = `postgres://${PG_LOGIN}@localhost:${PG_PORT}/postgres`;
export const TEST_URL = `postgres://${PG_LOGIN}@localhost:${PG_PORT}/${TEST_DB}`;

// the first user on a fresh database is the admin; they create everyone else
let adminCookie: string | null = null;
let adminEmail: string | null = null;
// one shared project that test diagrams live in (every diagram needs a project)
let testProjectId: string | null = null;

export interface TestCtx {
    app: FastifyInstance;
    db: ReturnType<typeof createDb>['db'];
    close: () => Promise<void>;
}

export async function createTestApp(
    overrides: Partial<Config> = {},
    introspect?: AppDeps['introspect'],
    /** set false to add a second app without wiping the first one's data */
    reset = true,
    /** the all-routes allowance per user; tests make many calls, so it is high by default */
    userRateLimit = 100_000
): Promise<TestCtx> {
    const config = {
        // tests make many calls; the limits are exercised with explicit overrides
        ...loadConfig({
            DATABASE_URL: TEST_URL,
            LOG_LEVEL: 'silent',
            LINT_RATE_LIMIT: '100000',
            OUTBOUND_RATE_LIMIT: '100000',
            AUTH_RATE_LIMIT: '100000',
            AUTH_MAX_FAILURES: '100000',
            // every save is recorded and every change published, so tests can
            // count them; the throttles have tests of their own
            AUDIT_SAVE_MINUTES: '0',
            AUTO_PUBLISH_COALESCE_SECONDS: '0',
        }),
        databaseUrl: TEST_URL,
        ...overrides,
    };
    const { db, pool } = createDb(TEST_URL);
    if (reset) {
        adminCookie = null;
        adminEmail = null;
        testProjectId = null;
        await pool.query(
            'truncate table audit_log, sessions, project_members, projects, diagrams, saved_connections, drift_settings, drift_reports, users restart identity cascade'
        );
    }
    // the limits count in the database, which a second app shares with the first;
    // a new app starts with every allowance unspent, as one with its own memory did
    await pool.query('delete from rate_counters');
    const app = buildApp({ config, db, introspect, userRateLimit });
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

/**
 * Marks an account's password as its own. It uses a connection of its own, so
 * it works whichever of several test apps is still open.
 */
async function settlePassword(email: string) {
    const client = new pg.Client({ connectionString: TEST_URL });
    await client.connect();
    try {
        await client.query(
            'update users set must_change_password = false where email = $1',
            [email]
        );
    } finally {
        await client.end();
    }
}

export async function registerUser(
    app: FastifyInstance,
    email: string,
    password = 'Password-123!',
    /**
     * An account an admin creates starts on a temporary password and may only
     * change it. Fixtures normally settle that, so the account can be used at
     * once; pass `temporary: true` to keep it as the API leaves it.
     */
    options: { temporary?: boolean } = {}
): Promise<TestUser> {
    if (adminCookie) {
        // self sign-up is closed: an admin creates the account, then it signs in
        const created = await app.inject({
            method: 'POST',
            url: '/admin/users',
            headers: { cookie: adminCookie },
            payload: { email, password },
        });
        if (created.statusCode !== 201) {
            throw new Error(
                `create user failed: ${created.statusCode} ${created.body}`
            );
        }
        if (!options.temporary) await settlePassword(email);
        return loginUser(app, email, password);
    }
    const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password },
    });
    if (res.statusCode !== 201) {
        throw new Error(`register failed: ${res.statusCode} ${res.body}`);
    }
    const set = res.cookies.find((c) => c.name === 'qbase_session')!;
    const cookie = `qbase_session=${set.value}`;
    adminCookie = cookie;
    adminEmail = email;
    return { id: res.json().id, email, cookie };
}

export async function loginUser(
    app: FastifyInstance,
    email: string,
    password = 'Password-123!'
): Promise<TestUser> {
    const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password },
    });
    if (res.statusCode !== 200) {
        throw new Error(`login failed: ${res.statusCode} ${res.body}`);
    }
    const set = res.cookies.find((c) => c.name === 'qbase_session')!;
    const cookie = `qbase_session=${set.value}`;
    // an account has one live session: signing the admin in again replaces the
    // one the helpers act as
    if (email === adminEmail) adminCookie = cookie;
    return { id: res.json().id, email, cookie };
}

/** The shared test project, created on first use by the admin (first user). */
export async function projectFor(app: FastifyInstance): Promise<string> {
    if (testProjectId) return testProjectId;
    if (!adminCookie) throw new Error('register the admin (first user) first');
    const res = await app.inject({
        method: 'POST',
        url: '/admin/projects',
        headers: { cookie: adminCookie },
        payload: { name: 'Test project' },
    });
    if (res.statusCode !== 201) {
        throw new Error(`create project failed: ${res.statusCode} ${res.body}`);
    }
    testProjectId = res.json().id;
    return testProjectId!;
}

/** Gives a user a role in the shared test project, as an admin would. */
export async function grant(
    app: FastifyInstance,
    user: TestUser,
    role: 'editor' | 'viewer'
): Promise<void> {
    const projectId = await projectFor(app);
    const res = await app.inject({
        method: 'PUT',
        url: `/admin/projects/${projectId}/members/${user.id}`,
        headers: { cookie: adminCookie! },
        payload: { role },
    });
    if (res.statusCode !== 200) {
        throw new Error(`grant failed: ${res.statusCode} ${res.body}`);
    }
}

export const as = (user: TestUser) => ({ cookie: user.cookie });

/**
 * A content save must say which copy it is based on. This adds the diagram's
 * current `updatedAt`, as the editor does, for tests that just want to save.
 */
export async function withBase<T extends object>(
    app: FastifyInstance,
    user: TestUser,
    id: string,
    payload: T
): Promise<T & { baseUpdatedAt?: string }> {
    if (!('content' in payload)) return payload;
    const current = await app.inject({
        url: `/diagrams/${id}`,
        headers: as(user),
    });
    return { ...payload, baseUpdatedAt: current.json().updatedAt };
}

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
    const projectId = await projectFor(app);
    if (user.cookie !== adminCookie) await grant(app, user, 'editor');
    const res = await app.inject({
        method: 'POST',
        url: '/diagrams',
        headers: as(user),
        payload: { title, content: sampleContent, projectId },
    });
    return res.json().id;
}
