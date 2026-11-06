import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { csvCell, exportActivityCsv } from '../src/audit/export.js';
import {
    as,
    createDiagram,
    createTestApp,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

const BOM = '﻿';
const HEADER = 'time_utc,who,action,diagram,project,target_user,details\r\n';

describe('csvCell', () => {
    it('leaves a plain value alone and an empty one empty', () => {
        expect(csvCell('diagram.publish')).toBe('diagram.publish');
        expect(csvCell('')).toBe('');
        expect(csvCell(null)).toBe('');
        expect(csvCell(undefined)).toBe('');
    });

    it('quotes a value with a comma, a quote or a line break', () => {
        expect(csvCell('a,b')).toBe('"a,b"');
        expect(csvCell('say "hi"')).toBe('"say ""hi"""');
        expect(csvCell('two\nlines')).toBe('"two\nlines"');
        expect(csvCell('two\r\nlines')).toBe('"two\r\nlines"');
    });

    it('keeps non-Latin text as it is', () => {
        expect(csvCell('ბაზა ორდერები')).toBe('ბაზა ორდერები');
    });

    it('stops a spreadsheet from running a title as a formula', () => {
        for (const bad of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx']) {
            expect(csvCell(bad).replace(/^"/, '').startsWith("'")).toBe(true);
        }
        expect(csvCell('=HYPERLINK("http://x","y")')).toBe(
            '"\'=HYPERLINK(""http://x"",""y"")"'
        );
        // a dash or equals sign later in the value is harmless
        expect(csvCell('a-b=c')).toBe('a-b=c');
    });
});

describe('GET /admin/audit/export', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let member: TestUser;

    const get = (user: TestUser | null, query = '') =>
        ctx.app.inject({
            url: `/admin/audit/export${query}`,
            headers: user ? as(user) : {},
        });

    /** Rows for a made-up actor, so a test sees only what it inserted. */
    const insertAs = async (
        userId: string,
        rows: { action: string; at: string; meta?: object }[]
    ) => {
        for (const r of rows) {
            await ctx.db.execute(
                sql`insert into audit_log (user_id, action, at, meta)
                    values (${userId}, ${r.action}, ${r.at}::timestamptz,
                            ${r.meta ? JSON.stringify(r.meta) : null}::jsonb)`
            );
        }
    };

    const lines = (csv: string) =>
        csv
            .replace(BOM, '')
            .split('\r\n')
            .filter((l) => l !== '');

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
        member = await registerUser(ctx.app, 'member@example.com');
    });
    afterAll(() => ctx.close());

    it('is for admins only', async () => {
        expect((await get(null)).statusCode).toBe(401);
        expect((await get(member)).statusCode).toBe(404);
    });

    it('sends a CSV file with a header row and a byte-order mark', async () => {
        const res = await get(admin);
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
        expect(res.headers['content-disposition']).toMatch(
            /^attachment; filename="qbase-activity-\d{4}-\d{2}-\d{2}\.csv"$/
        );
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.body.startsWith(BOM + HEADER)).toBe(true);
    });

    it('lists newest first, with who, what and when', async () => {
        const actor = randomUUID();
        await ctx.db.execute(
            sql`insert into users (id, email, password_hash)
                values (${actor}, 'actor@example.com', 'x')`
        );
        await insertAs(actor, [
            {
                action: 'project.create',
                at: '2031-01-01T10:00:00Z',
                meta: { name: 'Orders' },
            },
            {
                action: 'diagram.publish',
                at: '2031-01-02T10:00:00Z',
                meta: { version: 3 },
            },
        ]);
        const res = await get(admin, `?userId=${actor}`);
        const rows = lines(res.body);
        expect(rows).toHaveLength(3);
        expect(rows[1]).toBe(
            '2031-01-02T10:00:00.000Z,actor@example.com,diagram.publish,,,,"{""version"":3}"'
        );
        expect(rows[2]).toContain(
            '2031-01-01T10:00:00.000Z,actor@example.com,project.create'
        );
        expect(res.headers['x-row-count']).toBe('2');
        expect(res.headers['x-truncated']).toBe('false');
    });

    it('applies the same filters as the list: group, date range and saves', async () => {
        const actor = randomUUID();
        await ctx.db.execute(
            sql`insert into users (id, email, password_hash)
                values (${actor}, 'filter@example.com', 'x')`
        );
        await insertAs(actor, [
            { action: 'diagram.update', at: '2032-03-01T09:00:00Z' },
            { action: 'diagram.publish', at: '2032-03-01T10:00:00Z' },
            { action: 'share.create', at: '2032-03-02T10:00:00Z' },
            { action: 'share.revoke', at: '2032-04-01T10:00:00Z' },
        ]);
        const actions = async (query: string) =>
            lines((await get(admin, `?userId=${actor}&${query}`)).body)
                .slice(1)
                .map((l) => l.split(',')[2]);

        expect(await actions('')).toEqual([
            'share.revoke',
            'share.create',
            'diagram.publish',
            'diagram.update',
        ]);
        expect(await actions('saves=hide')).toEqual([
            'share.revoke',
            'share.create',
            'diagram.publish',
        ]);
        expect(await actions('group=sharing')).toEqual([
            'share.revoke',
            'share.create',
        ]);
        expect(
            await actions('from=2032-03-02T00:00:00Z&to=2032-03-31T00:00:00Z')
        ).toEqual(['share.create']);
    });

    it('names the diagram and the project, and quotes a title that needs it', async () => {
        const id = await createDiagram(ctx.app, admin, 'Orders, "v2"');
        const res = await get(admin, `?diagramId=${id}`);
        const rows = lines(res.body);
        expect(rows.length).toBeGreaterThanOrEqual(2);
        expect(res.body).toContain('"Orders, ""v2"""');
    });

    it('does not let a diagram title run as a formula in a spreadsheet', async () => {
        const id = await createDiagram(
            ctx.app,
            admin,
            '=HYPERLINK("http://evil.example","open")'
        );
        const res = await get(admin, `?diagramId=${id}`);
        expect(res.body).toContain(
            '"\'=HYPERLINK(""http://evil.example"",""open"")"'
        );
        // no cell begins with the equals sign
        for (const line of lines(res.body)) {
            expect(line).not.toMatch(/(^|,)=/);
            expect(line).not.toMatch(/(^|,)"=/);
        }
    });

    it('keeps a deleted account out of the who column but not out of the file', async () => {
        const gone = randomUUID();
        await insertAs(gone, [
            { action: 'user.sign_in', at: '2033-01-01T00:00:00Z' },
        ]);
        const res = await get(admin, `?userId=${gone}`);
        expect(lines(res.body)[1]).toBe(
            '2033-01-01T00:00:00.000Z,,user.sign_in,,,,'
        );
    });

    it('walks past the page size without skipping or repeating a row', async () => {
        const actor = randomUUID();
        await ctx.db.execute(
            sql`insert into users (id, email, password_hash)
                values (${actor}, 'many@example.com', 'x')`
        );
        await ctx.db.execute(
            sql`insert into audit_log (user_id, action, at)
                select ${actor}, 'user.sign_in',
                       '2034-01-01T00:00:00Z'::timestamptz + (g * interval '1 second')
                  from generate_series(1, 1201) g`
        );
        const res = await get(admin, `?userId=${actor}`);
        const rows = lines(res.body).slice(1);
        expect(rows).toHaveLength(1201);
        expect(new Set(rows.map((r) => r.split(',')[0])).size).toBe(1201);
        // newest first
        const times = rows.map((r) => r.split(',')[0]);
        expect([...times].sort().reverse()).toEqual(times);
        expect(res.headers['x-row-count']).toBe('1201');
    });

    it('stops at the most rows one file holds and says so', async () => {
        const actor = randomUUID();
        await ctx.db.execute(
            sql`insert into users (id, email, password_hash)
                values (${actor}, 'cap@example.com', 'x')`
        );
        await ctx.db.execute(
            sql`insert into audit_log (user_id, action, at)
                select ${actor}, 'user.sign_in',
                       '2035-01-01T00:00:00Z'::timestamptz + (g * interval '1 second')
                  from generate_series(1, 12) g`
        );
        const capped = await exportActivityCsv(
            ctx.db,
            { userId: actor, saves: 'show' },
            5
        );
        expect(capped.rows).toBe(5);
        expect(capped.truncated).toBe(true);
        // exactly the limit is not truncated
        const exact = await exportActivityCsv(
            ctx.db,
            { userId: actor, saves: 'show' },
            12
        );
        expect(exact.rows).toBe(12);
        expect(exact.truncated).toBe(false);
    });

    it('refuses a filter it does not know', async () => {
        expect((await get(admin, '?group=nonsense')).statusCode).toBe(400);
        expect((await get(admin, '?userId=not-a-uuid')).statusCode).toBe(400);
    });

    it('records that an admin took a copy, with how many rows', async () => {
        const before = await ctx.app.inject({
            url: '/admin/audit?group=exports',
            headers: as(admin),
        });
        const res = await get(admin, '?saves=hide');
        const rows = Number(res.headers['x-row-count']);
        const after = (
            await ctx.app.inject({
                url: '/admin/audit?group=exports',
                headers: as(admin),
            })
        ).json();
        expect(after.items.length).toBe(before.json().items.length + 1);
        expect(after.items[0]).toMatchObject({
            action: 'audit.export',
            userEmail: 'admin@example.com',
            meta: { rows, filters: { saves: 'hide' } },
        });
    });

    it('keeps people who are not admins from taking a copy, and writes nothing for them', async () => {
        const before = (
            await ctx.app.inject({
                url: '/admin/audit?group=exports',
                headers: as(admin),
            })
        ).json().items.length;
        await get(member);
        const after = (
            await ctx.app.inject({
                url: '/admin/audit?group=exports',
                headers: as(admin),
            })
        ).json().items.length;
        expect(after).toBe(before);
    });
});
