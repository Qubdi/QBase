import { rmSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_URL } from './helpers.js';
import { foldersBefore, foldersThrough, urlFor } from './migration-helpers.js';

// Migration 0020 (two-factor) run against a database that already holds
// users in the old shape, in its own throwaway database.

const MIGRATION = '0020_two_factor';
const DATABASE = 'qubdidb_mig_two_factor';

describe('migration 0020: two-factor', () => {
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
        await pool.query(
            `insert into users (email, password_hash, is_admin)
             values ('a@example.com', 'x', true), ('b@example.com', 'x', false)`
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

    it('leaves every existing account with two-factor off and keeps their data', async () => {
        const { rows } = await pool.query(
            `select email, mfa_secret_enc, mfa_enabled_at, mfa_last_step
               from users order by email`
        );
        expect(rows).toEqual([
            { email: 'a@example.com', mfa_secret_enc: null, mfa_enabled_at: null, mfa_last_step: null },
            { email: 'b@example.com', mfa_secret_enc: null, mfa_enabled_at: null, mfa_last_step: null },
        ]);
    });

    it('refuses to switch two-factor on without a secret', async () => {
        await expect(
            pool.query(`update users set mfa_enabled_at = now() where email = 'a@example.com'`)
        ).rejects.toThrow(/users_mfa_secret_when_enabled/);
        await pool.query(
            `update users set mfa_secret_enc = 'v1:x', mfa_enabled_at = now() where email = 'a@example.com'`
        );
        await pool.query(
            `update users set mfa_secret_enc = null, mfa_enabled_at = null where email = 'a@example.com'`
        );
    });

    it('keeps one recovery code hash once per user and deletes them with the user', async () => {
        const { rows } = await pool.query(`select id from users where email = 'b@example.com'`);
        const id = rows[0].id;
        await pool.query(`insert into mfa_recovery_codes (user_id, code_hash) values ($1, 'h1')`, [id]);
        await expect(
            pool.query(`insert into mfa_recovery_codes (user_id, code_hash) values ($1, 'h1')`, [id])
        ).rejects.toThrow(/mfa_recovery_codes_user_hash_idx/);
        await pool.query(
            `insert into mfa_challenges (id, user_id, expires_at) values ('t', $1, now())`,
            [id]
        );
        await pool.query('delete from users where id = $1', [id]);
        const codes = await pool.query('select 1 from mfa_recovery_codes');
        const challenges = await pool.query('select 1 from mfa_challenges');
        expect(codes.rowCount).toBe(0);
        expect(challenges.rowCount).toBe(0);
    });

    it('refuses a negative attempt count', async () => {
        const { rows } = await pool.query(`select id from users where email = 'a@example.com'`);
        await expect(
            pool.query(
                `insert into mfa_challenges (id, user_id, expires_at, attempts)
                 values ('n', $1, now(), -1)`,
                [rows[0].id]
            )
        ).rejects.toThrow(/mfa_challenges_attempts_nonneg/);
    });
});
