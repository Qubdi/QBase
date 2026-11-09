import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_UNPAGED_ROWS } from '../src/lib/limits.js';
import { as, createDiagram, createTestApp, registerUser, type TestCtx, type TestUser } from './helpers.js';

describe('lists that are not paged stop at a cap', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let diagramId: string;
    let projectId: string;

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
        diagramId = await createDiagram(ctx.app, admin, 'Big team');
        const [row] = (
            await ctx.db.execute(sql`select project_id from diagrams where id = ${diagramId}`)
        ).rows as { project_id: string }[];
        projectId = row.project_id;
        // one statement makes more members than the cap
        await ctx.db.execute(sql`
            insert into users (email, password_hash)
            select 'member' || i || '@example.com', 'x' from generate_series(1, ${MAX_UNPAGED_ROWS + 1}) i`);
        await ctx.db.execute(sql`
            insert into project_members (project_id, user_id, role)
            select ${projectId}::uuid, id, 'viewer' from users where email like 'member%@example.com'`);
    });
    afterAll(() => ctx.close());

    it('cuts the diagram members list at the cap, in email order', async () => {
        const res = await ctx.app.inject({ url: `/diagrams/${diagramId}/members`, headers: as(admin) });
        expect(res.statusCode).toBe(200);
        const rows = res.json() as { email: string }[];
        expect(rows).toHaveLength(MAX_UNPAGED_ROWS);
        const emails = rows.map((r) => r.email);
        expect(emails).toEqual([...emails].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    });

    it('cuts the admin project members list at the cap', async () => {
        const res = await ctx.app.inject({ url: `/admin/projects/${projectId}/members`, headers: as(admin) });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toHaveLength(MAX_UNPAGED_ROWS);
    });
});
