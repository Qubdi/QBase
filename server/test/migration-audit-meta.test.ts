import { rmSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_URL } from './helpers.js';
import { foldersBefore, foldersThrough, urlFor } from './migration-helpers.js';

// Migration 0016 (audit meta and sign-in tracking) run against a database that
// already holds users, sessions and audit rows in the old shape. It runs in its
// own throwaway database and stops after 0016.

const MIGRATION = '0016_audit_meta_and_sign_in_tracking';
const DATABASE = 'qubdidb_mig_audit_meta';

describe('migration 0016: audit meta and sign-in tracking', () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    const before = foldersBefore(MIGRATION);
    const through = foldersThrough(MIGRATION);
    let pool: pg.Pool;
    let userId: string;

    const columnOf = async (table: string, name: string) =>
        (
            await pool.query(
                `select data_type, is_nullable from information_schema.columns
                  where table_schema = 'public' and table_name = $1
                    and column_name = $2`,
                [table, name]
            )
        ).rows[0];

    beforeAll(async () => {
        await admin.connect();
        await admin.query(`drop database if exists ${DATABASE} with (force)`);
        await admin.query(`create database ${DATABASE}`);
        pool = new pg.Pool({ connectionString: urlFor(DATABASE) });
        const db = drizzle(pool);

        await migrate(db, { migrationsFolder: before });
        // data in the old shape
        const { rows } = await pool.query<{ id: string }>(
            `insert into users (email, password_hash, is_admin)
             values ('a@example.com', 'x', true), ('b@example.com', 'x', false)
             returning id`
        );
        userId = rows[0].id;
        await pool.query(
            `insert into sessions (id, user_id, expires_at)
             values ('live', $1, now() + interval '7 days'),
                    ('expired', $2, now() - interval '1 day')`,
            [rows[0].id, rows[1].id]
        );
        await pool.query(
            `insert into audit_log (user_id, action)
             values ($1, 'user.register'), ($1, 'diagram.update'), ($1, 'project.create')`,
            [userId]
        );
        expect((await columnOf('sessions', 'created_at'))).toBeUndefined();

        await migrate(db, { migrationsFolder: through });
    });

    afterAll(async () => {
        await pool.end();
        await admin.query(`drop database if exists ${DATABASE} with (force)`);
        await admin.end();
        rmSync(before, { recursive: true, force: true });
        rmSync(through, { recursive: true, force: true });
    });

    it('adds the five columns with the intended nullability', async () => {
        expect(await columnOf('audit_log', 'meta')).toEqual({
            data_type: 'jsonb',
            is_nullable: 'YES',
        });
        expect(await columnOf('users', 'last_login_at')).toEqual({
            data_type: 'timestamp with time zone',
            is_nullable: 'YES',
        });
        expect(await columnOf('sessions', 'created_at')).toEqual({
            data_type: 'timestamp with time zone',
            is_nullable: 'NO',
        });
        expect(await columnOf('sessions', 'last_seen_at')).toEqual({
            data_type: 'timestamp with time zone',
            is_nullable: 'NO',
        });
        expect(await columnOf('sessions', 'user_agent')).toEqual({
            data_type: 'text',
            is_nullable: 'YES',
        });
    });

    it('keeps every existing row and leaves the new facts empty or at the migration day', async () => {
        const { rows: audit } = await pool.query(
            `select count(*)::int as n, count(meta)::int as with_meta from audit_log`
        );
        expect(audit[0]).toEqual({ n: 3, with_meta: 0 });

        const { rows: people } = await pool.query(
            `select count(*)::int as n, count(last_login_at)::int as signed_in from users`
        );
        expect(people[0]).toEqual({ n: 2, signed_in: 0 });

        const { rows: sessions } = await pool.query(
            `select id, user_agent,
                    abs(extract(epoch from now() - created_at)) < 120 as created_now,
                    abs(extract(epoch from now() - last_seen_at)) < 120 as seen_now
               from sessions order by id`
        );
        expect(sessions).toEqual([
            { id: 'expired', user_agent: null, created_now: true, seen_now: true },
            { id: 'live', user_agent: null, created_now: true, seen_now: true },
        ]);
    });

    describe('audit_log.meta', () => {
        const insert = (meta: string | null) =>
            pool.query(
                `insert into audit_log (user_id, action, meta) values ($1, 'x', $2::jsonb)`,
                [userId, meta]
            );

        it('takes nothing or a small object', async () => {
            await insert(null);
            await insert('{"projectId":"p1","name":"Billing"}');
        });

        it.each([
            ['an array', '[1,2]'],
            ['a number', '7'],
            ['a string', '"text"'],
            ['an object over 1 KB', JSON.stringify({ name: 'x'.repeat(1100) })],
        ])('refuses %s', async (_, meta) => {
            await expect(insert(meta)).rejects.toMatchObject({
                code: '23514',
                constraint: 'audit_log_meta_small',
            });
        });
    });

    describe('sessions.user_agent', () => {
        const insert = (agent: string) =>
            pool.query(
                `insert into sessions (id, user_id, expires_at, user_agent)
                 values ($1, $2, now() + interval '1 day', $3)`,
                [`agent-${agent.length}`, userId, agent]
            );

        it('takes up to 200 characters, counted as characters', async () => {
            await insert('a'.repeat(200));
            await insert('\u{1F600}'.repeat(200));
        });

        it('refuses 201', async () => {
            await expect(insert('a'.repeat(201))).rejects.toMatchObject({
                code: '23514',
                constraint: 'sessions_user_agent_len',
            });
        });
    });
});
