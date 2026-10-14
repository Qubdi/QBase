import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog } from '../src/db/schema.js';
import {
    as,
    createDiagram,
    createTestApp,
    registerUser,
    sampleContent,
    type TestCtx,
    type TestUser,
    grant,
    projectFor,
} from './helpers.js';

describe('diagrams and permissions', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    let editor: TestUser;
    let viewer: TestUser;
    let stranger: TestUser;
    let diagramId: string;

    beforeAll(async () => {
        ctx = await createTestApp();
        owner = await registerUser(ctx.app, 'owner@example.com');
        editor = await registerUser(ctx.app, 'editor@example.com');
        viewer = await registerUser(ctx.app, 'viewer@example.com');
        stranger = await registerUser(ctx.app, 'stranger@example.com');
        diagramId = await createDiagram(ctx.app, owner);
        for (const [u, role] of [
            [editor, 'editor'],
            [viewer, 'viewer'],
        ] as const) {
            await grant(ctx.app, u, role);
        }
    });
    afterAll(() => ctx.close());

    it('requires login for every diagram endpoint', async () => {
        for (const [method, url] of [
            ['GET', '/diagrams'],
            ['POST', '/diagrams'],
            ['GET', `/diagrams/${diagramId}`],
            ['PUT', `/diagrams/${diagramId}`],
            ['DELETE', `/diagrams/${diagramId}`],
        ] as const) {
            const res = await ctx.app.inject({ method, url, payload: {} });
            expect(res.statusCode, `${method} ${url}`).toBe(401);
        }
    });

    it('creates a diagram in a project (an admin creator is the owner)', async () => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/diagrams',
            headers: as(owner),
            payload: {
                title: 'Another',
                content: sampleContent,
                projectId: await projectFor(ctx.app),
            },
        });
        expect(res.statusCode).toBe(201);
        expect(res.json().role).toBe('owner');
        expect(res.json().content).toEqual(sampleContent);
    });

    it('validates the create body', async () => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/diagrams',
            headers: as(owner),
            payload: { title: '', content: {} },
        });
        expect(res.statusCode).toBe(400);
    });

    it('lets every member read, with their role', async () => {
        for (const [u, role] of [
            [owner, 'owner'],
            [editor, 'editor'],
            [viewer, 'viewer'],
        ] as const) {
            const res = await ctx.app.inject({
                url: `/diagrams/${diagramId}`,
                headers: as(u),
            });
            expect(res.statusCode).toBe(200);
            expect(res.json().role).toBe(role);
        }
    });

    it('hides the diagram from strangers with 404 on every method', async () => {
        for (const [method, payload] of [
            ['GET', undefined],
            ['PUT', { title: 'hack' }],
            ['DELETE', undefined],
        ] as const) {
            const res = await ctx.app.inject({
                method,
                url: `/diagrams/${diagramId}`,
                headers: as(stranger),
                payload,
            });
            expect(res.statusCode, method).toBe(404);
        }
    });

    it('returns 404 for unknown ids and 400 for malformed ids', async () => {
        const unknown = await ctx.app.inject({
            url: '/diagrams/00000000-0000-4000-8000-000000000000',
            headers: as(owner),
        });
        expect(unknown.statusCode).toBe(404);
        const bad = await ctx.app.inject({
            url: '/diagrams/not-a-uuid',
            headers: as(owner),
        });
        expect(bad.statusCode).toBe(400);
    });

    it('lists only diagrams in projects the user belongs to', async () => {
        const mine = await ctx.app.inject({
            url: '/diagrams',
            headers: as(viewer),
        });
        // the whole project is visible to its members
        expect(mine.json().map((d: { id: string }) => d.id)).toContain(
            diagramId
        );
        const none = await ctx.app.inject({
            url: '/diagrams',
            headers: as(stranger),
        });
        expect(none.json()).toEqual([]);
    });

    it('stops a viewer from editing or deleting', async () => {
        const put = await ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${diagramId}`,
            headers: as(viewer),
            payload: { title: 'nope' },
        });
        expect(put.statusCode).toBe(403);
        const del = await ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${diagramId}`,
            headers: as(viewer),
        });
        expect(del.statusCode).toBe(403);
        const check = await ctx.app.inject({
            url: `/diagrams/${diagramId}`,
            headers: as(owner),
        });
        expect(check.json().title).toBe('My diagram');
    });

    it('lets an editor update but not delete', async () => {
        const put = await ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${diagramId}`,
            headers: as(editor),
            payload: { title: 'Edited', content: { ...sampleContent, name: 'X' } },
        });
        expect(put.statusCode).toBe(200);
        expect(put.json().title).toBe('Edited');
        expect(put.json().content.name).toBe('X');
        const del = await ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${diagramId}`,
            headers: as(editor),
        });
        expect(del.statusCode).toBe(403);
    });

    it('rejects an empty update', async () => {
        const res = await ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${diagramId}`,
            headers: as(owner),
            payload: {},
        });
        expect(res.statusCode).toBe(400);
    });

    it('lets the owner delete, after which nobody can read it', async () => {
        const id = await createDiagram(ctx.app, owner, 'Temp');
        const del = await ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${id}`,
            headers: as(owner),
        });
        expect(del.statusCode).toBe(204);
        const get = await ctx.app.inject({
            url: `/diagrams/${id}`,
            headers: as(owner),
        });
        expect(get.statusCode).toBe(404);
    });

    it('audits create, update and delete', async () => {
        const id = await createDiagram(ctx.app, owner, 'Audited');
        await ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${id}`,
            headers: as(owner),
            payload: { title: 'Audited 2' },
        });
        await ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${id}`,
            headers: as(owner),
        });
        const rows = (await ctx.db.select().from(auditLog)).filter(
            (r) => r.diagramId === id
        );
        expect(rows.map((r) => r.action)).toEqual([
            'diagram.create',
            'diagram.update',
            'diagram.delete',
        ]);
        expect(rows.every((r) => r.userId === owner.id)).toBe(true);
    });
});
