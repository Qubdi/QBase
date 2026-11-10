import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const hashed = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../src/lib/hash.js', async (importOriginal) => {
    const real = await importOriginal<typeof import('../src/lib/hash.js')>();
    return {
        ...real,
        // the routes hash with the sliced version: count its calls
        diagramHashAsync: (title: string, content: unknown) => {
            hashed.calls++;
            return real.diagramHashAsync(title, content);
        },
    };
});

const { diagrams, snapshots } = await import('../src/db/schema.js');
const { diagramHash } = await import('../src/lib/hash.js');
const {
    as,
    createDiagram,
    createTestApp,
    registerUser,
    sampleContent,
    withBase,
} = await import('./helpers.js');
type TestCtx = Awaited<ReturnType<typeof createTestApp>>;
type TestUser = Awaited<ReturnType<typeof registerUser>>;

describe('the stored content hash', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    let id: string;

    const get = () =>
        ctx.app.inject({ url: `/diagrams/${id}`, headers: as(owner) });
    const row = async () =>
        (await ctx.db.select().from(diagrams).where(eq(diagrams.id, id)))[0];
    const put = async (changes: object) =>
        ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${id}`,
            headers: as(owner),
            payload: await withBase(ctx.app, owner, id, changes),
        });
    const publish = () =>
        ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${id}/publish`,
            headers: as(owner),
            payload: {},
        });
    const callsDuring = async (action: () => Promise<unknown>) => {
        const before = hashed.calls;
        await action();
        return hashed.calls - before;
    };

    beforeAll(async () => {
        ctx = await createTestApp();
        owner = await registerUser(ctx.app, 'owner@example.com');
        id = await createDiagram(ctx.app, owner, 'Shop');
    });
    afterAll(() => ctx.close());

    it('is worked out when the diagram is created', async () => {
        const created = await row();
        expect(created.contentHash).toBe(
            diagramHash(created.title, created.content)
        );
    });

    it('is not worked out again by reading the diagram, published or not', async () => {
        expect(await callsDuring(get)).toBe(0);
        await publish();
        expect(await callsDuring(get)).toBe(0);
        expect(await callsDuring(get)).toBe(0);
    });

    it('is worked out once per save of new content, and the reply does not repeat it', async () => {
        const content = { ...sampleContent, name: 'Shop, edited' };
        expect(await callsDuring(() => put({ content }))).toBe(1);
        const saved = await row();
        expect(saved.contentHash).toBe(diagramHash(saved.title, saved.content));
        expect(await callsDuring(get)).toBe(0);
    });

    it('follows a new title saved together with new content', async () => {
        await put({
            title: 'Renamed shop',
            content: { ...sampleContent, name: 'Again' },
        });
        const saved = await row();
        expect(saved.title).toBe('Renamed shop');
        expect(saved.contentHash).toBe(
            diagramHash('Renamed shop', saved.content)
        );
    });

    it('after a rename alone is worked out once, by the reply, and not by later reads', async () => {
        // the hash is only needed to compare with a published version
        await publish();
        // content is not part of the request, so the save cannot hash it; the
        // reply (which compares with the published version) does, and stores it
        expect(await callsDuring(() => put({ title: 'Only the title' }))).toBe(
            1
        );
        const filled = await row();
        expect(filled.contentHash).toBe(
            diagramHash('Only the title', filled.content)
        );
        expect(await callsDuring(get)).toBe(0);
    });

    it('is filled in for a diagram saved before it existed', async () => {
        await ctx.db
            .update(diagrams)
            .set({ contentHash: null })
            .where(eq(diagrams.id, id));
        expect(await callsDuring(get)).toBe(1);
        expect((await row()).contentHash).not.toBeNull();
        expect(await callsDuring(get)).toBe(0);
    });

    it('is reused to publish: nothing is hashed again once a save has stored it', async () => {
        await put({ content: { ...sampleContent, name: 'Ready to publish' } });
        expect(await callsDuring(publish)).toBe(0);
        const snapshot = (
            await ctx.db
                .select()
                .from(snapshots)
                .where(eq(snapshots.diagramId, id))
                .orderBy(desc(snapshots.version))
                .limit(1)
        )[0];
        expect(snapshot.contentHash).toBe((await row()).contentHash);
    });

    it('is worked out once, for a diagram that has none stored, when it is published', async () => {
        await put({ content: { ...sampleContent, name: 'No stored hash' } });
        await ctx.db
            .update(diagrams)
            .set({ contentHash: null })
            .where(eq(diagrams.id, id));
        expect(await callsDuring(publish)).toBe(1);
        const published = (
            await ctx.db
                .select()
                .from(snapshots)
                .where(eq(snapshots.diagramId, id))
                .orderBy(desc(snapshots.version))
                .limit(1)
        )[0];
        expect(published.contentHash).toBe(
            diagramHash(published.title, published.content)
        );
        expect((await get()).json().unpublishedChanges).toBe(false);
    });

    it('still tells whether there is anything to publish', async () => {
        await publish();
        expect((await get()).json().unpublishedChanges).toBe(false);
        await put({ content: { ...sampleContent, name: 'After publish' } });
        expect((await get()).json().unpublishedChanges).toBe(true);
    });
});
