import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, runMigrations } from '../src/db/client.js';
import { ADMIN_URL } from './helpers.js';
import { urlFor } from './migration-helpers.js';

// Replicas that start together must not run the migrations at once.
describe('migrations at start-up', () => {
    const name = 'qbase_migration_lock';
    let admin: pg.Client;

    beforeAll(async () => {
        admin = new pg.Client({ connectionString: ADMIN_URL });
        await admin.connect();
        await admin.query(`drop database if exists ${name} with (force)`);
        await admin.query(`create database ${name}`);
    });
    afterAll(async () => {
        await admin.query(`drop database if exists ${name} with (force)`);
        await admin.end();
    });

    it('lets four replicas start at once on an empty database', async () => {
        const replicas = Array.from({ length: 4 }, () =>
            createDb(urlFor(name), { max: 2 })
        );
        try {
            await Promise.all(replicas.map((r) => runMigrations(r.db)));
        } finally {
            await Promise.all(replicas.map((r) => r.pool.end()));
        }
        const check = new pg.Client({ connectionString: urlFor(name) });
        check.on('error', () => undefined); // force-dropped later: the ended connection is expected
        await check.connect();
        try {
            const res = await check.query(
                'select count(*)::int as n from drizzle.__drizzle_migrations'
            );
            expect(res.rows[0].n).toBeGreaterThan(20);
            const tables = await check.query(
                "select to_regclass('public.diagrams') as t"
            );
            expect(tables.rows[0].t).toBe('diagrams');
        } finally {
            await check.end();
        }
    });
});
