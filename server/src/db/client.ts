import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = ReturnType<typeof createDb>['db'];

export interface PoolOptions {
    /** most connections the pool opens at once */
    max?: number;
    /** longest a statement may run before the database cancels it; 0 or unset: no limit */
    statementTimeoutMs?: number;
    /** longest a statement waits for a table lock before it gives up; 0 or unset: waits for good */
    lockTimeoutMs?: number;
    /** longest a connection may sit inside an open transaction doing nothing; default one minute, 0 turns it off */
    idleInTransactionTimeoutMs?: number;
}

export function createDb(databaseUrl: string, options: PoolOptions = {}) {
    const pool = new pg.Pool({
        connectionString: databaseUrl,
        max: options.max ?? 10,
        // fail a request instead of queueing forever when the database is down
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
        // a runaway query must not hold one of the few connections for good
        ...(options.statementTimeoutMs
            ? { statement_timeout: options.statementTimeoutMs }
            : {}),
        // a statement queued behind a lock holds up every request that
        // queues behind it, so it is better to give up and try again
        ...(options.lockTimeoutMs ? { lock_timeout: options.lockTimeoutMs } : {}),
        // a transaction left open (a crashed handler, a lost client) keeps its
        // locks and its connection until the database ends it
        idle_in_transaction_session_timeout:
            options.idleInTransactionTimeoutMs ?? 60_000,
    });
    // an idle client that loses its connection emits 'error'; unhandled, it
    // would crash the process
    pool.on('error', (err) => {
        console.error('Postgres pool error:', err.message);
    });
    const db = drizzle(pool, { schema });
    return { db, pool };
}

/** Advisory lock keys, one per job that must run in one server process at a time. */
export const MIGRATION_LOCK = 7_155_001;
export const MAINTENANCE_LOCK = 7_155_002;

/**
 * Runs `fn` while this process holds a Postgres advisory lock, taken on a
 * connection of its own that is held until `fn` ends (a crashed process drops
 * it with its connection). With `wait`, a second caller queues behind the
 * first; without it, `ran` is false and `fn` is skipped.
 */
export async function withAdvisoryLock<T>(
    db: Db,
    key: number,
    fn: () => Promise<T>,
    { wait }: { wait: boolean }
): Promise<{ ran: true; value: T } | { ran: false }> {
    const client = await db.$client.connect();
    let held = false;
    try {
        if (wait) {
            await client.query('select pg_advisory_lock($1::bigint)', [key]);
            held = true;
        } else {
            const res = await client.query<{ ok: boolean }>(
                'select pg_try_advisory_lock($1::bigint) as ok',
                [key]
            );
            held = res.rows[0]?.ok === true;
        }
        if (!held) return { ran: false };
        return { ran: true, value: await fn() };
    } finally {
        let released = !held;
        if (held) {
            released = await client
                .query('select pg_advisory_unlock($1::bigint)', [key])
                .then(
                    () => true,
                    () => false
                );
        }
        // a connection that may still hold the lock must not go back to the pool
        client.release(released ? undefined : true);
    }
}

/**
 * Applies the pending migrations. Replicas that start together take turns
 * (the first applies them, the others find nothing left), because the
 * migrator itself takes no lock. Needs a pool of at least two connections:
 * one holds the lock while the other runs the migrations.
 */
export async function runMigrations(
    db: Db,
    { attempts = 20, retryDelayMs = 3_000 } = {}
) {
    // The migration pool has a lock_timeout. A statement that cannot get its
    // table lock gives up (55P03) instead of queueing and blocking every
    // request behind it; the whole run is one transaction, so it is safe to
    // start again once the other holder has finished. A replica that waits for
    // the advisory lock while another migrates gives up the same way and
    // goes back to waiting.
    for (let attempt = 1; ; attempt++) {
        try {
            await migrateOnce(db);
            return;
        } catch (err) {
            if (!isLockTimeout(err) || attempt >= attempts) throw err;
            await new Promise((r) => setTimeout(r, retryDelayMs));
        }
    }
}

function isLockTimeout(err: unknown): boolean {
    for (let e: unknown = err, depth = 0; e && depth < 3; depth++) {
        if ((e as { code?: unknown }).code === '55P03') return true;
        e = (e as { cause?: unknown }).cause;
    }
    return false;
}

async function migrateOnce(db: Db) {
    await withAdvisoryLock(
        db,
        MIGRATION_LOCK,
        () =>
            migrate(db, {
                migrationsFolder: new URL(
                    './migrations',
                    import.meta.url
                ).pathname
                    .replace(/^\/([A-Za-z]:)/, '$1')
                    .replace(/%20/g, ' '),
            }),
        { wait: true }
    );
}
