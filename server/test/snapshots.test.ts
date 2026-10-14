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
} from './helpers.js';

describe('published snapshots', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    let editor: TestUser;
    let viewer: TestUser;
    let stranger: TestUser;
    let id: string;

    const publish = (u: TestUser, note?: string, diagramId = id) =>
        ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${diagramId}/publish`,
            headers: as(u),
            payload: note === undefined ? {} : { note },
        });
    const get = (u: TestUser, diagramId = id) =>
        ctx.app.inject({ url: `/diagrams/${diagramId}`, headers: as(u) });
    const edit = (u: TestUser, patch: object, diagramId = id) =>
        ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${diagramId}`,
            headers: as(u),
            payload: patch,
        });

    beforeAll(async () => {
        ctx = await createTestApp();
        owner = await registerUser(ctx.app, 'owner@example.com');
        editor = await registerUser(ctx.app, 'editor@example.com');
        viewer = await registerUser(ctx.app, 'viewer@example.com');
        stranger = await registerUser(ctx.app, 'stranger@example.com');
        id = await createDiagram(ctx.app, owner);
        for (const [u, role] of [
            [editor, 'editor'],
            [viewer, 'viewer'],
        ] as const) {
            await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${id}/members`,
                headers: as(owner),
                payload: { email: u.email, role },
            });
        }
    });
    afterAll(() => ctx.close());

    it('shows viewers no content before anything is published', async () => {
        const res = await get(viewer);
        expect(res.statusCode).toBe(200);
        expect(res.json().content).toBeNull();
        expect(res.json().publishedVersion).toBeNull();
        expect(res.json()).not.toHaveProperty('unpublishedChanges');
    });

    it('reports unpublished changes to writers before the first publish', async () => {
        const res = await get(owner);
        expect(res.json().publishedVersion).toBeNull();
        expect(res.json().unpublishedChanges).toBe(true);
    });

    it('blocks viewers and strangers from publishing', async () => {
        expect((await publish(viewer)).statusCode).toBe(403);
        expect((await publish(stranger)).statusCode).toBe(404);
        expect((await get(owner)).json().publishedVersion).toBeNull();
    });

    it('requires login to publish', async () => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${id}/publish`,
        });
        expect(res.statusCode).toBe(401);
    });

    it('lets an editor publish v1 with a note', async () => {
        const res = await publish(editor, 'first cut');
        expect(res.statusCode).toBe(201);
        expect(res.json()).toMatchObject({ version: 1, note: 'first cut' });
        const owned = await get(owner);
        expect(owned.json().publishedVersion).toBe(1);
        expect(owned.json().unpublishedChanges).toBe(false);
    });

    it('keeps viewers on the snapshot while editors keep changing the working copy', async () => {
        await edit(owner, {
            title: 'Renamed',
            content: { ...sampleContent, name: 'Edited' },
        });
        const writer = await get(owner);
        expect(writer.json().title).toBe('Renamed');
        expect(writer.json().unpublishedChanges).toBe(true);

        const seen = await get(viewer);
        expect(seen.json().title).toBe('My diagram');
        expect(seen.json().content).toEqual(sampleContent);
        expect(seen.json().publishedVersion).toBe(1);

        const list = await ctx.app.inject({
            url: '/diagrams',
            headers: as(viewer),
        });
        expect(list.json()[0].title).toBe('My diagram');
    });

    it('shows the new content to viewers only after the next publish', async () => {
        const res = await publish(owner, 'second');
        expect(res.json().version).toBe(2);
        const seen = await get(viewer);
        expect(seen.json().title).toBe('Renamed');
        expect(seen.json().content.name).toBe('Edited');
        expect((await get(owner)).json().unpublishedChanges).toBe(false);
    });

    it('is not fooled by key order or a bare updatedAt bump', async () => {
        // v2 content was { ...sampleContent, name: 'Edited' } with title 'Renamed'
        const reordered = {
            tables: sampleContent.tables,
            updatedAt: '2030-01-01T00:00:00.000Z',
            name: 'Edited',
            databaseType: sampleContent.databaseType,
            id: sampleContent.id,
        };
        await edit(owner, { content: reordered });
        expect((await get(owner)).json().unpublishedChanges).toBe(false);

        await edit(owner, { content: { ...reordered, name: 'Really edited' } });
        expect((await get(owner)).json().unpublishedChanges).toBe(true);
        await edit(owner, { content: reordered });
        expect((await get(owner)).json().unpublishedChanges).toBe(false);
    });

    it('lists and fetches versions for any member, newest first', async () => {
        const list = await ctx.app.inject({
            url: `/diagrams/${id}/versions`,
            headers: as(viewer),
        });
        expect(list.statusCode).toBe(200);
        expect(list.json().map((v: { version: number }) => v.version)).toEqual([
            2, 1,
        ]);
        expect(list.json()[1]).toMatchObject({
            version: 1,
            note: 'first cut',
            publishedBy: 'editor@example.com',
        });
        expect(list.json()[0]).not.toHaveProperty('content');

        const one = await ctx.app.inject({
            url: `/diagrams/${id}/versions/1`,
            headers: as(viewer),
        });
        expect(one.json().content).toEqual(sampleContent);
        expect(one.json().title).toBe('My diagram');
    });

    it('404s for unknown versions and for strangers', async () => {
        const missing = await ctx.app.inject({
            url: `/diagrams/${id}/versions/99`,
            headers: as(viewer),
        });
        expect(missing.statusCode).toBe(404);
        const nope = await ctx.app.inject({
            url: `/diagrams/${id}/versions`,
            headers: as(stranger),
        });
        expect(nope.statusCode).toBe(404);
        const bad = await ctx.app.inject({
            url: `/diagrams/${id}/versions/abc`,
            headers: as(viewer),
        });
        expect(bad.statusCode).toBe(400);
    });

    it('offers no way to delete a version', async () => {
        const res = await ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${id}/versions/1`,
            headers: as(owner),
        });
        expect(res.statusCode).toBe(404);
        const list = await ctx.app.inject({
            url: `/diagrams/${id}/versions`,
            headers: as(owner),
        });
        expect(list.json()).toHaveLength(2);
    });

    it('numbers concurrent publishes without gaps or duplicates', async () => {
        const fresh = await createDiagram(ctx.app, owner, 'Race');
        const results = await Promise.all(
            Array.from({ length: 8 }, () => publish(owner, undefined, fresh))
        );
        expect(results.every((r) => r.statusCode === 201)).toBe(true);
        const versions = results.map((r) => r.json().version).sort(
            (a: number, b: number) => a - b
        );
        expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('audits publishes', async () => {
        const rows = (await ctx.db.select().from(auditLog)).filter(
            (r) => r.diagramId === id && r.action === 'diagram.publish'
        );
        expect(rows).toHaveLength(2);
    });

    it('deletes snapshots together with the diagram', async () => {
        const tmp = await createDiagram(ctx.app, owner, 'Temp');
        await publish(owner, undefined, tmp);
        await ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${tmp}`,
            headers: as(owner),
        });
        const res = await ctx.app.inject({
            url: `/diagrams/${tmp}/versions`,
            headers: as(owner),
        });
        expect(res.statusCode).toBe(404);
    });
});

describe('auto-publish', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    let viewer: TestUser;
    let id: string;

    beforeAll(async () => {
        ctx = await createTestApp();
        owner = await registerUser(ctx.app, 'owner@example.com');
        viewer = await registerUser(ctx.app, 'viewer@example.com');
        id = await createDiagram(ctx.app, owner);
        await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${id}/members`,
            headers: as(owner),
            payload: { email: viewer.email, role: 'viewer' },
        });
    });
    afterAll(() => ctx.close());

    const versions = async () =>
        (
            await ctx.app.inject({
                url: `/diagrams/${id}/versions`,
                headers: as(owner),
            })
        ).json();

    it('is off by default', async () => {
        await ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${id}`,
            headers: as(owner),
            payload: { title: 'A' },
        });
        expect(await versions()).toHaveLength(0);
    });

    it('publishes on every real change once enabled, and only then', async () => {
        const on = await ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${id}`,
            headers: as(owner),
            payload: { autoPublish: true },
        });
        expect(on.json().autoPublish).toBe(true);
        expect(await versions()).toHaveLength(1);

        const save = (title: string) =>
            ctx.app.inject({
                method: 'PUT',
                url: `/diagrams/${id}`,
                headers: as(owner),
                payload: { title },
            });
        await save('B');
        expect(await versions()).toHaveLength(2);
        await save('B');
        expect(await versions()).toHaveLength(2);

        const seen = await ctx.app.inject({
            url: `/diagrams/${id}`,
            headers: as(viewer),
        });
        expect(seen.json().title).toBe('B');
        expect(seen.json().publishedVersion).toBe(2);
    });

    it('stops publishing when disabled again', async () => {
        await ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${id}`,
            headers: as(owner),
            payload: { autoPublish: false },
        });
        await ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${id}`,
            headers: as(owner),
            payload: { title: 'C' },
        });
        expect(await versions()).toHaveLength(2);
    });
});
