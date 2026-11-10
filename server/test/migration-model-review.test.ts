import { rmSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_URL } from './helpers.js';
import { foldersBefore, foldersThrough, urlFor } from './migration-helpers.js';

// Migration 0015 (model review) run against a database that already holds data in
// the old shape. Each case gets its own throwaway database, so neither the
// development database nor the shared test database is touched. It stops after
// 0015, so later migrations never change what this test checks.

const MIGRATION = '0015_model_review';

describe('migration 0015: model review', () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    const before = foldersBefore(MIGRATION);
    const through = foldersThrough(MIGRATION);
    const databases: string[] = [];
    const pools: pg.Pool[] = [];

    beforeAll(() => admin.connect());
    afterAll(async () => {
        await Promise.all(pools.map((p) => p.end()));
        for (const name of databases) {
            await admin.query(`drop database if exists ${name} with (force)`);
        }
        await admin.end();
        rmSync(before, { recursive: true, force: true });
        rmSync(through, { recursive: true, force: true });
    });

    /** A new database brought up to the shape just before 0015, holding sample data. */
    async function oldShapeDb(name: string, extraEmails: string[] = []) {
        await admin.query(`drop database if exists ${name} with (force)`);
        await admin.query(`create database ${name}`);
        databases.push(name);
        const pool = new pg.Pool({ connectionString: urlFor(name) });
        pool.on('error', () => undefined); // force-dropped later: the ended connection is expected
        pools.push(pool);
        const db = drizzle(pool);
        await migrate(db, { migrationsFolder: before });

        const { rows: users } = await pool.query<{ id: string }>(
            `insert into users (email, password_hash, is_admin)
             values ('a@example.com', 'x', true), ('b@example.com', 'x', false)
             returning id`
        );
        for (const email of extraEmails) {
            await pool.query(
                `insert into users (email, password_hash) values ($1, 'x')`,
                [email]
            );
        }
        const [a] = users;
        const {
            rows: [project],
        } = await pool.query<{ id: string }>(
            `insert into projects (name, slug) values ('P', 'p') returning id`
        );
        const {
            rows: [diagram],
        } = await pool.query<{ id: string }>(
            `insert into diagrams (owner_id, project_id, title, content)
             values ($1, $2, 'D', '{}') returning id`,
            [a.id, project.id]
        );
        await pool.query(
            `insert into drift_reports (diagram_id, status, trigger)
             values ($1, 'clean', 'manual'), ($1, 'drifted', 'schedule')`,
            [diagram.id]
        );
        // three audit rows, then the newest is purged: the sequence is now ahead
        // of the highest id, and the migration must keep it there
        await pool.query(
            `insert into audit_log (user_id, action, diagram_id)
             values ($1, 'user.register', null), ($1, 'diagram.create', $2),
                    ($1, 'diagram.update', $2)`,
            [a.id, diagram.id]
        );
        await pool.query(`delete from audit_log where id = 3`);
        return { pool, db, userId: a.id, diagramId: diagram.id };
    }

    const column = async (pool: pg.Pool, table: string, name: string) => {
        const { rows } = await pool.query(
            `select data_type, udt_name, is_identity, identity_generation
               from information_schema.columns
              where table_schema = 'public' and table_name = $1
                and column_name = $2`,
            [table, name]
        );
        return rows[0];
    };

    const indexNames = async (pool: pg.Pool) =>
        (
            await pool.query<{ indexname: string }>(
                `select indexname from pg_indexes where schemaname = 'public'`
            )
        ).rows.map((r) => r.indexname);

    it('starts from the old shape', async () => {
        const { pool } = await oldShapeDb('qbase_mig_old');
        expect((await column(pool, 'audit_log', 'id')).data_type).toBe(
            'integer'
        );
        expect((await column(pool, 'drift_reports', 'trigger')).data_type).toBe(
            'text'
        );
        expect(await indexNames(pool)).toContain('audit_log_at_idx');
        expect(await indexNames(pool)).not.toContain('users_email_lower_idx');
    });

    describe('on a database that holds data', () => {
        let pool: pg.Pool;
        let userId: string;
        let diagramId: string;

        beforeAll(async () => {
            const old = await oldShapeDb('qbase_mig_data');
            ({ pool, userId, diagramId } = old);
            await migrate(old.db, { migrationsFolder: through });
        });

        it('keeps every audit row and its id', async () => {
            const { rows } = await pool.query(
                `select id::text, action from audit_log order by id`
            );
            expect(rows).toEqual([
                { id: '1', action: 'user.register' },
                { id: '2', action: 'diagram.create' },
            ]);
        });

        it('makes audit_log.id a bigint identity that carries on after the old sequence', async () => {
            const id = await column(pool, 'audit_log', 'id');
            expect(id.data_type).toBe('bigint');
            expect(id.is_identity).toBe('YES');
            expect(id.identity_generation).toBe('ALWAYS');
            // id 3 was purged but is not handed out again
            const { rows } = await pool.query(
                `insert into audit_log (user_id, action) values ($1, 'user.update')
                 returning id::text`,
                [userId]
            );
            expect(rows[0].id).toBe('4');
        });

        it('refuses an id chosen by the caller', async () => {
            await expect(
                pool.query(
                    `insert into audit_log (id, user_id, action) values (99, $1, 'user.update')`,
                    [userId]
                )
            ).rejects.toMatchObject({ code: '428C9' });
        });

        it('turns drift_reports.trigger into an enum and keeps both old values', async () => {
            expect((await column(pool, 'drift_reports', 'trigger')).udt_name).toBe(
                'drift_trigger'
            );
            const { rows } = await pool.query(
                `select trigger::text as trigger from drift_reports order by status`
            );
            expect(rows.map((r) => r.trigger)).toEqual(['manual', 'schedule']);
            await expect(
                pool.query(
                    `insert into drift_reports (diagram_id, status, trigger)
                     values ($1, 'clean', 'hourly')`,
                    [diagramId]
                )
            ).rejects.toMatchObject({ code: '22P02' });
        });

        it('refuses a second account that differs only by letter case', async () => {
            await expect(
                pool.query(
                    `insert into users (email, password_hash) values ('A@Example.com', 'x')`
                )
            ).rejects.toMatchObject({
                code: '23505',
                constraint: 'users_email_lower_idx',
            });
        });

        it('adds the new indexes and drops the one it replaces', async () => {
            const names = await indexNames(pool);
            for (const name of [
                'sessions_user_idx',
                'diagrams_project_idx',
                'diagrams_owner_idx',
                'share_links_diagram_idx',
                'snapshots_published_by_idx',
                'audit_log_at_id_idx',
                'audit_log_action_at_idx',
                'users_email_lower_idx',
            ]) {
                expect(names).toContain(name);
            }
            expect(names).not.toContain('audit_log_at_idx');
        });
    });

    describe('when two accounts share an email apart from letter case', () => {
        it('stops with a plain message, keeps no email in it, and changes nothing', async () => {
            const { pool, db } = await oldShapeDb('qbase_mig_clash', [
                'Clash@example.com',
                'clash@example.com',
            ]);
            const failure = await migrate(db, {
                migrationsFolder: through,
            }).then(
                () => null,
                (err: Error) => err
            );
            expect(failure).not.toBeNull();
            // Drizzle wraps the database error; the cause carries the message
            const message = `${failure?.message} ${(failure as { cause?: Error })?.cause?.message}`;
            expect(message).toMatch(/more than one account/);
            expect(message).not.toMatch(/clash@example\.com/i);

            // the migration ran in one transaction, so it left the old shape intact
            expect((await column(pool, 'audit_log', 'id')).data_type).toBe(
                'integer'
            );
            expect(await indexNames(pool)).not.toContain('users_email_lower_idx');
            const { rowCount } = await pool.query(
                `select 1 from pg_type where typname = 'drift_trigger'`
            );
            expect(rowCount).toBe(0);
        });
    });
});
