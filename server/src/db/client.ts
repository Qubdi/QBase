import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = ReturnType<typeof createDb>['db'];

export interface PoolOptions {
    /** most connections the pool opens at once */
    max?: number;
}

export function createDb(databaseUrl: string, options: PoolOptions = {}) {
    const pool = new pg.Pool({
        connectionString: databaseUrl,
        max: options.max ?? 10,
        // fail a request instead of queueing forever when the database is down
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
    });
    // an idle client that loses its connection emits 'error'; unhandled, it
    // would crash the process
    pool.on('error', (err) => {
        console.error('Postgres pool error:', err.message);
    });
    const db = drizzle(pool, { schema });
    return { db, pool };
}

export async function runMigrations(db: Db) {
    await migrate(db, {
        migrationsFolder: new URL('./migrations', import.meta.url).pathname
            .replace(/^\/([A-Za-z]:)/, '$1')
            .replace(/%20/g, ' '),
    });
}
