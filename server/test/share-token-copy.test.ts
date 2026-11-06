import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    as,
    createDiagram,
    createTestApp,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

describe('copying an active share link again', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    let id: string;

    const list = async () =>
        (
            await ctx.app.inject({
                url: `/diagrams/${id}/share-links`,
                headers: as(owner),
            })
        ).json() as { id: string; token?: string }[];

    beforeAll(async () => {
        ctx = await createTestApp({ connectionKey: 'a-test-key-of-16-chars' });
        owner = await registerUser(ctx.app, 'owner@example.com');
        id = await createDiagram(ctx.app, owner);
    });
    afterAll(() => ctx.close());

    it('lists the token of an active link, and a regenerated one replaces it', async () => {
        const made = (
            await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${id}/share-links`,
                headers: as(owner),
                payload: {},
            })
        ).json();
        expect((await list()).find((l) => l.id === made.id)?.token).toBe(
            made.token
        );

        const again = (
            await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${id}/share-links/${made.id}/regenerate`,
                headers: as(owner),
            })
        ).json();
        expect(again.token).not.toBe(made.token);
        expect((await list()).find((l) => l.id === made.id)?.token).toBe(
            again.token
        );
    });

    it('forgets the token once the link is revoked', async () => {
        const made = (
            await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${id}/share-links`,
                headers: as(owner),
                payload: {},
            })
        ).json();
        await ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${id}/share-links/${made.id}`,
            headers: as(owner),
        });
        expect(
            (await list()).find((l) => l.id === made.id)?.token
        ).toBeUndefined();
    });
});

describe('without a key', () => {
    it('shows the token only once, as before', async () => {
        const ctx = await createTestApp({ connectionKey: null });
        try {
            const owner = await registerUser(ctx.app, 'owner@example.com');
            const id = await createDiagram(ctx.app, owner);
            const made = (
                await ctx.app.inject({
                    method: 'POST',
                    url: `/diagrams/${id}/share-links`,
                    headers: as(owner),
                    payload: {},
                })
            ).json();
            expect(made.token).toBeTruthy();
            const rows = (
                await ctx.app.inject({
                    url: `/diagrams/${id}/share-links`,
                    headers: as(owner),
                })
            ).json();
            expect(rows[0].token).toBeUndefined();
        } finally {
            await ctx.close();
        }
    });
});
