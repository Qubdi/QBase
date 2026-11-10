import { rmSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_URL } from './helpers.js';
import { foldersBefore, foldersThrough, urlFor } from './migration-helpers.js';

// Migration 0018 (drop the comments table and its enum) run against a database
// that holds comments, diagrams and audit rows. It runs in its own throwaway
// database and stops after 0018.

const MIGRATION = '0018_drop_comments';
const DATABASE = 'qbase_mig_drop_comments';

describe('migration 0018: drop comments', () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    const before = foldersBefore(MIGRATION);
    const through = foldersThrough(MIGRATION);
    let pool: pg.Pool;

    const exists = async (sql: string, ...params: unknown[]) =>
        ((await pool.query(sql, params)).rowCount ?? 0) > 0;

    beforeAll(async () => {
        await admin.connect();
        await admin.query(`drop database if exists ${DATABASE} with (force)`);
        await admin.query(`create database ${DATABASE}`);
        pool = new pg.Pool({ connectionString: urlFor(DATABASE) });
        pool.on('error', () => undefined); // force-dropped later: the ended connection is expected
        const db = drizzle(pool);

        await migrate(db, { migrationsFolder: before });
        // a diagram with two comments on it, and audit rows about comments
        const user = (
            await pool.query<{ id: string }>(
                `insert into users (email, password_hash) values ('a@example.com', 'x') returning id`
            )
        ).rows[0].id;
        const project = (
            await pool.query<{ id: string }>(
                `insert into projects (name, slug) values ('P', 'p') returning id`
            )
        ).rows[0].id;
        const diagram = (
            await pool.query<{ id: string }>(
                `insert into diagrams (owner_id, project_id, title, content)
                 values ($1, $2, 'Orders', '{}'::jsonb) returning id`,
                [user, project]
            )
        ).rows[0].id;
        await pool.query(
            `insert into comments (diagram_id, target_type, target_id, body, author_id)
             values ($1, 'table', 't1', 'first', $2), ($1, 'field', 'f1', 'second', $2)`,
            [diagram, user]
        );
        await pool.query(
            `insert into audit_log (user_id, action, diagram_id)
             values ($1, 'comment.create', $2), ($1, 'diagram.publish', $2)`,
            [user, diagram]
        );
        expect(await exists(`select 1 from comments`)).toBe(true);

        await migrate(db, { migrationsFolder: through });
    });

    afterAll(async () => {
        await pool.end();
        await admin.query(`drop database if exists ${DATABASE} with (force)`);
        await admin.end();
        rmSync(before, { recursive: true, force: true });
        rmSync(through, { recursive: true, force: true });
    });

    it('removes the comments table and its enum', async () => {
        expect(
            await exists(
                `select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'comments'`
            )
        ).toBe(false);
        expect(
            await exists(
                `select 1 from pg_type where typname = 'comment_target'`
            )
        ).toBe(false);
    });

    it('leaves the diagram it belonged to, and everything else, alone', async () => {
        const { rows } = await pool.query(`select title from diagrams`);
        expect(rows).toEqual([{ title: 'Orders' }]);
        expect(
            (await pool.query(`select count(*)::int as n from users`)).rows[0].n
        ).toBe(1);
    });

    it('keeps the audit rows, including the ones about comments: history is not rewritten', async () => {
        const { rows } = await pool.query(
            `select action from audit_log order by id`
        );
        expect(rows.map((r) => r.action)).toEqual([
            'comment.create',
            'diagram.publish',
        ]);
    });

    it('leaves the other enums', async () => {
        for (const name of ['share_access', 'drift_status']) {
            expect(
                await exists(`select 1 from pg_type where typname = $1`, name)
            ).toBe(true);
        }
    });
});
