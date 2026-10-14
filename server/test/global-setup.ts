import pg from 'pg';
import { createDb, runMigrations } from '../src/db/client.js';
import { ADMIN_URL, TEST_DB, TEST_URL } from './helpers.js';

export default async function setup() {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    const exists = await admin.query(
        'select 1 from pg_database where datname = $1',
        [TEST_DB]
    );
    if (exists.rowCount === 0) {
        await admin.query(`create database ${TEST_DB}`);
    }
    await admin.end();

    const { db, pool } = createDb(TEST_URL);
    await runMigrations(db);
    await pool.end();
}
