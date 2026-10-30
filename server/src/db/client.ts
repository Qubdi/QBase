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
export async function runMigrations(db: Db) {
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
