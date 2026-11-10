import { rmSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_URL } from './helpers.js';
import { foldersBefore, foldersThrough, urlFor } from './migration-helpers.js';

// Migration 0026 against recovery codes stored the old ways, in its own throwaway database.

const MIGRATION = '0026_recovery_code_hash_prefix';
const DATABASE = 'qbase_mig_recovery_prefix';

describe('migration 0026: recovery code hash prefix', () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    const before = foldersBefore(MIGRATION);
    const through = foldersThrough(MIGRATION);
    let pool: pg.Pool;

    beforeAll(async () => {
        await admin.connect();
        await admin.query(`drop database if exists ${DATABASE} with (force)`);
        await admin.query(`create database ${DATABASE}`);
        pool = new pg.Pool({ connectionString: urlFor(DATABASE) });
        const db = drizzle(pool);
        await migrate(db, { migrationsFolder: before });
        const { rows } = await pool.query(
            `insert into users (email, password_hash, is_admin)
             values ('a@example.com', 'x', true), ('b@example.com', 'x', false) returning id, email`
        );
        const a = rows.find((r) => r.email === 'a@example.com').id as string;
        const b = rows.find((r) => r.email === 'b@example.com').id as string;
        const bare = 'a'.repeat(64);
        const hmac = 'b'.repeat(64);
        await pool.query(
            `insert into mfa_recovery_codes (user_id, code_hash) values
               ($1, $3), ($1, $4), ($1, 'k1:' || $4), ($2, $3)`,
            [a, b, bare, hmac]
        );
        await migrate(db, { migrationsFolder: through });
    });

    afterAll(async () => {
        await pool.end();
        await admin.query(`drop database if exists ${DATABASE} with (force)`);
        await admin.end();
        rmSync(before, { recursive: true, force: true });
        rmSync(through, { recursive: true, force: true });
    });

    it('drops every code stored without the prefix and keeps the prefixed ones', async () => {
        const { rows } = await pool.query(`select code_hash from mfa_recovery_codes order by code_hash`);
        expect(rows).toEqual([{ code_hash: `k1:${'b'.repeat(64)}` }]);
    });

    it('keeps the users', async () => {
        const { rows } = await pool.query(`select count(*)::int as n from users`);
        expect(rows[0].n).toBe(2);
    });
});
