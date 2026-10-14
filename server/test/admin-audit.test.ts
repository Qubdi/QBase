import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    as,
    createDiagram,
    createTestApp,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

describe('GET /admin/audit', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let member: TestUser;
    let diagramId: string;

    const list = (user: TestUser | null, query = '') =>
        ctx.app.inject({
            url: `/admin/audit${query}`,
            headers: user ? as(user) : {},
        });

    beforeAll(async () => {
        ctx = await createTestApp();
        // the first account is the admin
        admin = await registerUser(ctx.app, 'admin@example.com');
        member = await registerUser(ctx.app, 'member@example.com');
        diagramId = await createDiagram(ctx.app, admin);
    });
    afterAll(() => ctx.close());

    it('requires login and hides itself from non-admins', async () => {
        expect((await list(null)).statusCode).toBe(401);
        expect((await list(member)).statusCode).toBe(404);
    });

    it('lists newest first with the actor email', async () => {
        const res = await list(admin);
        expect(res.statusCode).toBe(200);
        const page = res.json();
        expect(page.total).toBeGreaterThan(0);
        const ats = page.items.map((r: { at: string }) => Date.parse(r.at));
        expect([...ats].sort((a, b) => b - a)).toEqual(ats);
        expect(
            page.items.some(
                (r: { action: string; userEmail: string }) =>
                    r.action === 'diagram.create' &&
                    r.userEmail === 'admin@example.com'
            )
        ).toBe(true);
    });

    it('filters by action and diagram, and pages', async () => {
        const byAction = (await list(admin, '?action=diagram.create')).json();
        expect(
            byAction.items.every(
                (r: { action: string }) => r.action === 'diagram.create'
            )
        ).toBe(true);

        const byDiagram = (
            await list(admin, `?diagramId=${diagramId}`)
        ).json();
        expect(byDiagram.total).toBeGreaterThan(0);
        expect(
            byDiagram.items.every(
                (r: { diagramId: string }) => r.diagramId === diagramId
            )
        ).toBe(true);

        const paged = (await list(admin, '?limit=1&page=1')).json();
        expect(paged.items).toHaveLength(1);
        expect(paged.limit).toBe(1);
    });

    it('rejects a malformed filter', async () => {
        expect((await list(admin, '?userId=nope')).statusCode).toBe(400);
    });
});
