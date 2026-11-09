import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diagramStats } from '../src/diagrams/summary.js';
import {
    as,
    createTestApp,
    grant,
    projectFor,
    registerUser,
    type TestCtx,
    withBase,
    type TestUser,
} from './helpers.js';

describe('diagramStats', () => {
    it('reads the database, counts and creation date from the content', () => {
        expect(
            diagramStats({
                databaseType: 'postgresql',
                databaseEdition: 'supabase',
                tables: [{}, {}, {}],
                relationships: [{}],
                createdAt: '2025-03-01T10:00:00.000Z',
            })
        ).toEqual({
            databaseType: 'postgresql',
            databaseEdition: 'supabase',
            tableCount: 3,
            relationshipCount: 1,
            createdAt: '2025-03-01T10:00:00.000Z',
        });
    });

    it('copes with missing or odd content', () => {
        const empty = {
            databaseType: null,
            databaseEdition: null,
            tableCount: 0,
            relationshipCount: 0,
            createdAt: null,
        };
        expect(diagramStats(undefined)).toEqual(empty);
        expect(diagramStats(null)).toEqual(empty);
        expect(diagramStats('text')).toEqual(empty);
        expect(diagramStats({})).toEqual(empty);
        expect(
            diagramStats({
                databaseType: 5,
                databaseEdition: '',
                tables: 'many',
                relationships: { a: 1 },
                createdAt: 12,
            })
        ).toEqual(empty);
    });
});

describe('diagram list summary', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let editor: TestUser;
    let viewer: TestUser;
    let projectId: string;
    const ids: Record<string, string> = {};

    const list = async (who: TestUser) =>
        (
            await ctx.app.inject({ url: '/diagrams', headers: as(who) })
        ).json() as Array<Record<string, unknown> & { id: string }>;
    const row = async (who: TestUser, id: string) =>
        (await list(who)).find((d) => d.id === id)!;

    const create = async (who: TestUser, title: string, content: object) =>
        (
            await ctx.app.inject({
                method: 'POST',
                url: '/diagrams',
                headers: as(who),
                payload: { title, content, projectId },
            })
        ).json().id as string;

    const put = async (who: TestUser, id: string, content: object) =>
        ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${id}`,
            headers: as(who),
            payload: await withBase(ctx.app, who, id, { content }),
        });

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
        editor = await registerUser(ctx.app, 'editor@example.com');
        viewer = await registerUser(ctx.app, 'viewer@example.com');
        await grant(ctx.app, editor, 'editor');
        await grant(ctx.app, viewer, 'viewer');
        projectId = await projectFor(ctx.app);

        ids.shop = await create(editor, 'Shop', {
            id: 'x',
            name: 'Shop',
            databaseType: 'postgresql',
            databaseEdition: 'supabase',
            tables: [{ id: 't1' }, { id: 't2' }],
            relationships: [{ id: 'r1' }],
            createdAt: '2025-03-01T10:00:00.000Z',
            updatedAt: '2025-03-02T10:00:00.000Z',
        });
        ids.bare = await create(editor, 'Bare', { id: 'y', name: 'Bare' });
    });
    afterAll(() => ctx.close());

    it('describes each diagram: database, counts, creation date and creator', async () => {
        const shop = await row(editor, ids.shop);
        expect(shop).toMatchObject({
            title: 'Shop',
            databaseType: 'postgresql',
            databaseEdition: 'supabase',
            tableCount: 2,
            relationshipCount: 1,
            createdAt: '2025-03-01T10:00:00.000Z',
            ownerEmail: 'editor@example.com',
        });
    });

    it('gives empty values, not errors, for a diagram with a bare document', async () => {
        const bare = await row(editor, ids.bare);
        expect(bare).toMatchObject({
            databaseType: null,
            databaseEdition: null,
            tableCount: 0,
            relationshipCount: 0,
            createdAt: null,
        });
    });

    it('gives admins the same description', async () => {
        const shop = await row(admin, ids.shop);
        expect(shop).toMatchObject({ tableCount: 2, databaseType: 'postgresql' });
        expect(shop.ownerEmail).toBe('editor@example.com');
    });

    it('shows a viewer nothing about a diagram that is not published yet', async () => {
        // not even that it is in the list: no title, no time of the last edit
        expect(await row(viewer, ids.shop)).toBeUndefined();
    });

    it('describes what a viewer can open: the published copy, not the working copy', async () => {
        await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${ids.shop}/publish`,
            headers: as(editor),
            payload: {},
        });
        // work continues after publishing: a third table and a different database
        await put(editor, ids.shop, {
            id: 'x',
            name: 'Shop',
            databaseType: 'mysql',
            tables: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
            relationships: [],
            createdAt: '2025-03-01T10:00:00.000Z',
        });
        const asEditor = await row(editor, ids.shop);
        expect(asEditor).toMatchObject({ tableCount: 3, databaseType: 'mysql' });
        const asViewer = await row(viewer, ids.shop);
        expect(asViewer).toMatchObject({
            tableCount: 2,
            relationshipCount: 1,
            databaseType: 'postgresql',
            databaseEdition: 'supabase',
        });
        // who owns the working copy is for people who can edit it
        expect(asViewer.ownerEmail).toBeNull();
    });

    it('agrees between writers and viewers once the work is published', async () => {
        await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${ids.shop}/publish`,
            headers: as(editor),
            payload: {},
        });
        const asEditor = await row(editor, ids.shop);
        const asViewer = await row(viewer, ids.shop);
        for (const key of [
            'databaseType',
            'databaseEdition',
            'tableCount',
            'relationshipCount',
            'createdAt',
        ]) {
            expect(asViewer[key], key).toEqual(asEditor[key]);
        }
    });

    it('pages the list on request and returns everything otherwise', async () => {
        const all = await list(editor);
        const get = async (query: string) =>
            (
                await ctx.app.inject({
                    url: `/diagrams${query}`,
                    headers: as(editor),
                })
            ).json() as Array<{ id: string }>;
        const first = await get('?limit=1');
        expect(first.map((d) => d.id)).toEqual([all[0].id]);
        const rest = await get('?limit=1&offset=1');
        expect(rest.map((d) => d.id)).toEqual([all[1].id]);
        expect((await get('?offset=1')).map((d) => d.id)).toEqual(
            all.slice(1).map((d) => d.id)
        );
        const bad = await ctx.app.inject({
            url: '/diagrams?limit=0',
            headers: as(editor),
        });
        expect(bad.statusCode).toBe(400);
    });
});
