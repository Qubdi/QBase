import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, diagramLocks } from '../src/db/schema.js';
import {
    as,
    createDiagram,
    createTestApp,
    registerUser,
    sampleContent,
    type TestCtx,
    withBase,
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

    it('rejects content whose collections or scalars have the wrong type', async () => {
        const project = await projectFor(ctx.app);
        for (const content of [
            { tables: 'not-a-list' },
            { relationships: { a: 1 } },
            { name: 42 },
            { databaseType: ['postgresql'] },
        ]) {
            const res = await ctx.app.inject({
                method: 'POST',
                url: '/diagrams',
                headers: as(owner),
                payload: { title: 'Bad', content, projectId: project },
            });
            expect(res.statusCode).toBe(400);
        }
        const res = await ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${diagramId}`,
            headers: as(owner),
            payload: { content: { tables: 'nope' } },
        });
        expect(res.statusCode).toBe(400);
    });

    it('keeps unknown keys in the content', async () => {
        const project = await projectFor(ctx.app);
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/diagrams',
            headers: as(owner),
            payload: {
                title: 'Extra',
                content: { ...sampleContent, somethingNew: { a: 1 } },
                projectId: project,
            },
        });
        expect(res.statusCode).toBe(201);
        expect(res.json().content.somethingNew).toEqual({ a: 1 });
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
            payload: await withBase(ctx.app, editor, diagramId, {
                title: 'Edited',
                content: { ...sampleContent, name: 'X' },
            }),
        });
        expect(put.statusCode).toBe(200);
        expect(put.json().title).toBe('Edited');
        // the reply leaves the content out: the editor just sent it
        expect(put.json().content).toBeUndefined();
        const after = await ctx.app.inject({
            url: `/diagrams/${diagramId}`,
            headers: as(editor),
        });
        expect(after.json().content.name).toBe('X');
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

describe('request body limits', () => {
    const big = (kb: number) => 'x'.repeat(kb * 1024);

    it('refuses a large body on ordinary routes', async () => {
        const ctx = await createTestApp({ bodyLimit: 2 * 1024 });
        try {
            const res = await ctx.app.inject({
                method: 'POST',
                url: '/auth/login',
                payload: { email: 'a@example.com', password: big(4) },
            });
            expect(res.statusCode).toBe(413);
        } finally {
            await ctx.close();
        }
    });

    it('lets the diagram routes take a body past the ordinary limit', async () => {
        const ctx = await createTestApp({
            bodyLimit: 2 * 1024,
            diagramBodyLimit: 64 * 1024,
        });
        try {
            const owner = await registerUser(ctx.app, 'o@example.com');
            const project = await projectFor(ctx.app);
            const ok = await ctx.app.inject({
                method: 'POST',
                url: '/diagrams',
                headers: as(owner),
                payload: {
                    title: 'Large',
                    content: { ...sampleContent, note: big(8) },
                    projectId: project,
                },
            });
            expect(ok.statusCode).toBe(201);
            const tooBig = await ctx.app.inject({
                method: 'POST',
                url: '/diagrams',
                headers: as(owner),
                payload: {
                    title: 'Huge',
                    content: { ...sampleContent, note: big(100) },
                    projectId: project,
                },
            });
            expect(tooBig.statusCode).toBe(413);
        } finally {
            await ctx.close();
        }
    });
});

describe('saving content on top of another save', () => {
    let ctx: TestCtx;
    let a: TestUser;
    let b: TestUser;
    let id: string;

    const save = (
        who: TestUser,
        content: object,
        baseUpdatedAt?: string | null
    ) =>
        ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${id}`,
            headers: as(who),
            payload: {
                content,
                ...(baseUpdatedAt === undefined ? {} : { baseUpdatedAt }),
            },
        });
    const current = async (who: TestUser): Promise<string> =>
        (
            await ctx.app.inject({
                url: `/diagrams/${id}`,
                headers: as(who),
            })
        ).json().updatedAt;

    beforeAll(async () => {
        ctx = await createTestApp();
        a = await registerUser(ctx.app, 'a@example.com');
        b = await registerUser(ctx.app, 'b@example.com');
        id = await createDiagram(ctx.app, a);
        await grant(ctx.app, b, 'editor');
    });
    afterAll(() => ctx.close());

    it('needs the base when content is saved', async () => {
        const res = await save(a, { ...sampleContent, name: 'no base' });
        expect(res.statusCode).toBe(400);
    });

    it('accepts a save based on the current copy and hands back the new updatedAt', async () => {
        const base = await current(a);
        const res = await save(a, { ...sampleContent, name: 'one' }, base);
        expect(res.statusCode).toBe(200);
        expect(res.json().content).toBeUndefined();
        expect(res.json().updatedAt).not.toBe(base);
        expect(await current(a)).toBe(res.json().updatedAt);
    });

    // the edit lock moving from one editor to the next, as when the first closes the diagram
    const passTheLock = () => ctx.db.delete(diagramLocks);

    it('refuses a save based on an older copy and leaves the newer one alone', async () => {
        const base = await current(a);
        await passTheLock();
        // b saves first, from the same starting point
        expect(
            (await save(b, { ...sampleContent, name: 'from b' }, base)).statusCode
        ).toBe(200);
        // a still holds the old copy
        await passTheLock();
        const stale = await save(a, { ...sampleContent, name: 'from a' }, base);
        expect(stale.statusCode).toBe(409);
        expect(stale.json()).toMatchObject({ error: 'conflict' });
        expect(stale.json().updatedAt).toBe(await current(a));
        const stored = await ctx.app.inject({
            url: `/diagrams/${id}`,
            headers: as(a),
        });
        expect(stored.json().content.name).toBe('from b');
    });

    it('lets the loser overwrite on purpose by saving on top of the latest copy', async () => {
        await passTheLock();
        const res = await save(a, { ...sampleContent, name: 'a again' }, await current(a));
        expect(res.statusCode).toBe(200);
        expect(res.json().content).toBeUndefined();
        const stored = await ctx.app.inject({
            url: `/diagrams/${id}`,
            headers: as(a),
        });
        expect(stored.json().content.name).toBe('a again');
    });

    it('lets only one of two simultaneous saves from the same copy win', async () => {
        const base = await current(a);
        // one editor, so the lock lets both in and only the base check decides
        const [r1, r2] = await Promise.all([
            save(a, { ...sampleContent, name: 'race 1' }, base),
            save(a, { ...sampleContent, name: 'race 2' }, base),
        ]);
        expect([r1.statusCode, r2.statusCode].sort()).toEqual([200, 409]);
    });

    it('does not ask for a base when only the title changes', async () => {
        const res = await ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${id}`,
            headers: as(a),
            payload: { title: 'renamed' },
        });
        expect(res.statusCode).toBe(200);
    });
});
