import { rmSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_URL } from './helpers.js';
import { foldersBefore, foldersThrough, urlFor } from './migration-helpers.js';

// Migration 0017 (users.must_change_password) run against a database that
// already holds users in the old shape. It runs in its own throwaway database
// and stops after 0017.

const MIGRATION = '0017_users_must_change_password';
const DATABASE = 'qubdidb_mig_must_change_pw';

describe('migration 0017: users.must_change_password', () => {
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
        // accounts in the old shape: an admin and two members
        await pool.query(
            `insert into users (email, password_hash, is_admin)
             values ('a@example.com', 'x', true), ('b@example.com', 'x', false),
                    ('c@example.com', 'x', false)`
        );
        const old = await pool.query(
            `select 1 from information_schema.columns
              where table_name = 'users' and column_name = 'must_change_password'`
        );
        expect(old.rowCount).toBe(0);

        await migrate(db, { migrationsFolder: through });
    });

    afterAll(async () => {
        await pool.end();
        await admin.query(`drop database if exists ${DATABASE} with (force)`);
        await admin.end();
        rmSync(before, { recursive: true, force: true });
        rmSync(through, { recursive: true, force: true });
    });

    it('adds a boolean that cannot be null and defaults to false', async () => {
        const { rows } = await pool.query(
            `select data_type, is_nullable, column_default
               from information_schema.columns
              where table_schema = 'public' and table_name = 'users'
                and column_name = 'must_change_password'`
        );
        expect(rows).toEqual([
            {
                data_type: 'boolean',
                is_nullable: 'NO',
                column_default: 'false',
            },
        ]);
    });

    it('leaves every existing account unflagged: nobody is forced to change a password', async () => {
        const { rows } = await pool.query(
            'select count(*)::int as n from users where must_change_password'
        );
        expect(rows[0].n).toBe(0);
        const all = await pool.query('select count(*)::int as n from users');
        expect(all.rows[0].n).toBe(3);
    });

    it('keeps the old data as it was', async () => {
        const { rows } = await pool.query(
            'select email, is_admin from users order by email'
        );
        expect(rows).toEqual([
            { email: 'a@example.com', is_admin: true },
            { email: 'b@example.com', is_admin: false },
            { email: 'c@example.com', is_admin: false },
        ]);
    });

    it('defaults a new account to false and refuses null', async () => {
        const made = await pool.query(
            `insert into users (email, password_hash) values ('d@example.com', 'x')
             returning must_change_password`
        );
        expect(made.rows[0].must_change_password).toBe(false);
        await expect(
            pool.query(
                `insert into users (email, password_hash, must_change_password)
                 values ('e@example.com', 'x', null)`
            )
        ).rejects.toThrow(/null value/);
    });
});
