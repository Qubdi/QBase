import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = ReturnType<typeof createDb>['db'];

export function createDb(databaseUrl: string) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
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
