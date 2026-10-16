import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_URL } from './helpers.js';

// Each index exists for a named query (see the comments in db/schema.ts). This
// asks the planner, with sequential scans switched off, whether it can use the
// index for that query. It guards the shape of an index (column order, DESC and
// NULLS FIRST) against drifting away from the query it serves; how fast the
// query is on real data is measured separately with EXPLAIN (ANALYZE, BUFFERS).

const ID = '00000000-0000-0000-0000-000000000001';
const WHEN = '2026-01-01T00:00:00Z';

const cases: { query: string; sql: string; index: string }[] = [
    {
        query: 'GET /admin/audit, no filter (also the keyset order)',
        sql: `select id, at, action, user_id, diagram_id from audit_log
              order by at desc, id desc limit 20`,
        index: 'audit_log_at_id_idx',
    },
    {
        query: 'retention delete: audit rows older than the cutoff',
        sql: `delete from audit_log where at < '${WHEN}'`,
        index: 'audit_log_at_id_idx',
    },
    {
        query: 'GET /admin/audit?action=',
        sql: `select id from audit_log where action = 'diagram.publish'
              order by at desc, id desc limit 20`,
        index: 'audit_log_action_at_idx',
    },
    {
        query: 'GET /admin/audit?userId=',
        sql: `select id from audit_log where user_id = '${ID}'
              order by at desc, id desc limit 20`,
        index: 'audit_log_user_at_idx',
    },
    {
        query: 'GET /admin/audit?diagramId=',
        sql: `select id from audit_log where diagram_id = '${ID}'
              order by at desc, id desc limit 20`,
        index: 'audit_log_diagram_at_idx',
    },
    {
        query: 'a project’s diagrams, newest first (workspace list)',
        sql: `select id, title, updated_at from diagrams
              where project_id = '${ID}' order by updated_at desc`,
        index: 'diagrams_project_idx',
    },
    {
        query: 'admin project list: diagrams in a project',
        sql: `select count(*) from diagrams where project_id = '${ID}'`,
        index: 'diagrams_project_idx',
    },
    {
        query: 'admin delete user: hand the diagrams to the admin',
        sql: `update diagrams set owner_id = '${ID}' where owner_id = '${ID}'`,
        index: 'diagrams_owner_idx',
    },
    {
        query: 'sign-in, sign-out, password reset: delete a user’s sessions',
        sql: `delete from sessions where user_id = '${ID}'`,
        index: 'sessions_user_idx',
    },
    {
        query: 'GET /diagrams/:id/share-links',
        sql: `select * from share_links where diagram_id = '${ID}'
              order by created_at desc`,
        index: 'share_links_diagram_idx',
    },
    {
        query: 'deleting a user: clear who published their snapshots',
        sql: `update snapshots set published_by = null where published_by = '${ID}'`,
        index: 'snapshots_published_by_idx',
    },
    {
        query: 'a diagram’s published versions (existing index, kept)',
        sql: `select version from snapshots where diagram_id = '${ID}'
              order by version desc`,
        index: 'snapshots_diagram_version_idx',
    },
    {
        query: 'sign-in: look a user up by email',
        sql: `select id from users where email = 'a@example.com'`,
        index: 'users_email_unique',
    },
];

describe('indexes serve the queries they were made for', () => {
    const client = new pg.Client({ connectionString: TEST_URL });
    beforeAll(async () => {
        await client.connect();
        // a tiny table is read with a sequential scan; ask for an index if one can serve
        await client.query('set enable_seqscan = off');
    });
    afterAll(() => client.end());

    it.each(cases)('$query', async ({ sql, index }) => {
        const { rows } = await client.query(`explain ${sql}`);
        const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
        expect(plan).toContain(index);
    });

    it('has no index that repeats another one on the same leading columns', async () => {
        const { rows } = await client.query<{
            tablename: string;
            indexname: string;
            columns: string;
        }>(
            `select tablename, indexname,
                    regexp_replace(indexdef, '^.*USING btree \\((.*)\\)$', '\\1') as columns
               from pg_indexes
              where schemaname = 'public' and indexdef like '%USING btree%'
                and indexdef not like '%WHERE%'`
        );
        const clashes: string[] = [];
        for (const a of rows) {
            for (const b of rows) {
                if (a.indexname >= b.indexname || a.tablename !== b.tablename) {
                    continue;
                }
                const [short, long] =
                    a.columns.length <= b.columns.length ? [a, b] : [b, a];
                if (
                    long.columns === short.columns ||
                    long.columns.startsWith(`${short.columns},`)
                ) {
                    clashes.push(`${short.indexname} repeats ${long.indexname}`);
                }
            }
        }
        expect(clashes).toEqual([]);
    });
});
