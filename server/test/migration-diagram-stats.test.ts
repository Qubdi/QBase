import { rmSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_URL } from './helpers.js';
import { foldersBefore, foldersThrough, urlFor } from './migration-helpers.js';

// Migration 0022 (diagram stats) run against a database that already holds
// diagrams, in its own throwaway database.

const MIGRATION = '0022_diagram_stats';
const DATABASE = 'qbase_mig_diagram_stats';

describe('migration 0022: diagram stats', () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    const before = foldersBefore(MIGRATION);
    const through = foldersThrough(MIGRATION);
    let pool: pg.Pool;
    let userId: string;
    let projectId: string;

    const insert = async (title: string, content: unknown) =>
        (
            await pool.query<{ id: string }>(
                `insert into diagrams (owner_id, project_id, title, content)
                 values ($1, $2, $3, $4::jsonb) returning id`,
                [userId, projectId, title, JSON.stringify(content)]
            )
        ).rows[0].id;

    const stats = async (id: string) =>
        (
            await pool.query(
                `select stat_database_type as "databaseType",
                        stat_database_edition as "databaseEdition",
                        stat_table_count as "tableCount",
                        stat_relationship_count as "relationshipCount",
                        stat_created_at as "createdAt"
                   from diagrams where id = $1`,
                [id]
            )
        ).rows[0];

    let full: string;
    let empty: string;
    let odd: string;

    beforeAll(async () => {
        await admin.connect();
        await admin.query(`drop database if exists ${DATABASE} with (force)`);
        await admin.query(`create database ${DATABASE}`);
        pool = new pg.Pool({ connectionString: urlFor(DATABASE) });
        const db = drizzle(pool);
        await migrate(db, { migrationsFolder: before });
        userId = (
            await pool.query<{ id: string }>(
                `insert into users (email, password_hash) values ('a@example.com', 'x') returning id`
            )
        ).rows[0].id;
        projectId = (
            await pool.query<{ id: string }>(
                `insert into projects (name, slug) values ('P', 'p') returning id`
            )
        ).rows[0].id;
        full = await insert('Full', {
            databaseType: 'postgresql',
            databaseEdition: 'enterprise',
            tables: [{}, {}, {}],
            relationships: [{}],
            createdAt: '2026-01-01T00:00:00.000Z',
        });
        empty = await insert('Empty', {});
        // content the editor never wrote: counts must not fail or invent numbers
        odd = await insert('Odd', {
            databaseType: '',
            tables: 'not a list',
            relationships: null,
        });
        await migrate(db, { migrationsFolder: through });
    });

    afterAll(async () => {
        await pool.end();
        await admin.query(`drop database if exists ${DATABASE} with (force)`);
        await admin.end();
        rmSync(before, { recursive: true, force: true });
        rmSync(through, { recursive: true, force: true });
    });

    it('fills in the numbers of diagrams that already exist', async () => {
        expect(await stats(full)).toEqual({
            databaseType: 'postgresql',
            databaseEdition: 'enterprise',
            tableCount: 3,
            relationshipCount: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
        });
    });

    it('counts nothing for a diagram with no tables, and reads blanks as missing', async () => {
        const none = {
            databaseType: null,
            databaseEdition: null,
            tableCount: 0,
            relationshipCount: 0,
            createdAt: null,
        };
        expect(await stats(empty)).toEqual(none);
        expect(await stats(odd)).toEqual(none);
    });

    it('keeps the numbers current when the content is saved', async () => {
        await pool.query(
            `update diagrams set content = $2::jsonb where id = $1`,
            [empty, JSON.stringify({ tables: [{}, {}], databaseType: 'mysql' })]
        );
        expect(await stats(empty)).toMatchObject({
            tableCount: 2,
            databaseType: 'mysql',
        });
    });
});
