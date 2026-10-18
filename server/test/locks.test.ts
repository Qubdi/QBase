import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { diagramLocks } from '../src/db/schema.js';
import {
    as,
    createDiagram,
    createTestApp,
    grant,
    registerUser,
    sampleContent,
    type TestCtx,
    type TestUser,
} from './helpers.js';

describe('diagram edit lock', () => {
    let ctx: TestCtx;
    let a: TestUser;
    let b: TestUser;
    let viewer: TestUser;
    let stranger: TestUser;
    let id: string;

    const lock = (who: TestUser, editorId: string, diagram = id) =>
        ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${diagram}/lock`,
            headers: as(who),
            payload: { editorId },
        });
    const unlock = (who: TestUser, editorId: string) =>
        ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${id}/lock?editorId=${editorId}`,
            headers: as(who),
        });
    const current = async (who: TestUser) =>
        (
            await ctx.app.inject({
                url: `/diagrams/${id}`,
                headers: as(who),
            })
        ).json().updatedAt as string;
    const save = async (
        who: TestUser,
        name: string,
        editorId?: string,
        extra: object = {}
    ) =>
        ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${id}`,
            headers: as(who),
            payload: {
                content: { ...sampleContent, name },
                baseUpdatedAt: await current(who),
                ...(editorId ? { editorId } : {}),
                ...extra,
            },
        });
    const expire = () =>
        ctx.db
            .update(diagramLocks)
            .set({ expiresAt: new Date(Date.now() - 1000) })
            .where(eq(diagramLocks.diagramId, id));

    beforeAll(async () => {
        ctx = await createTestApp();
        a = await registerUser(ctx.app, 'a@example.com');
        b = await registerUser(ctx.app, 'b@example.com');
        viewer = await registerUser(ctx.app, 'viewer@example.com');
        stranger = await registerUser(ctx.app, 'stranger@example.com');
        id = await createDiagram(ctx.app, a);
        await grant(ctx.app, b, 'editor');
        await grant(ctx.app, viewer, 'viewer');
    });
    afterAll(() => ctx.close());
    beforeEach(async () => {
        await ctx.db.delete(diagramLocks);
    });

    it('gives the lock to the first editor and tells the second who has it', async () => {
        const first = await lock(a, 'tab-a');
        expect(first.statusCode).toBe(200);
        expect(first.json()).toEqual({ held: true });

        const second = await lock(b, 'tab-b');
        expect(second.statusCode).toBe(200);
        expect(second.json()).toEqual({
            held: false,
            holder: 'a@example.com',
        });
    });

    it('lets the holder renew its lock, so the heartbeat keeps it', async () => {
        await lock(a, 'tab-a');
        const [row1] = await ctx.db.select().from(diagramLocks);
        await new Promise((r) => setTimeout(r, 20));
        expect((await lock(a, 'tab-a')).json()).toEqual({ held: true });
        const [row2] = await ctx.db.select().from(diagramLocks);
        expect(row2.expiresAt.getTime()).toBeGreaterThan(
            row1.expiresAt.getTime()
        );
    });

    it('treats a second tab of the same user as another editor', async () => {
        await lock(a, 'tab-1');
        const other = await lock(a, 'tab-2');
        expect(other.json()).toEqual({ held: false, holder: 'a@example.com' });
    });

    it('frees the diagram when its editor lets go', async () => {
        await lock(a, 'tab-a');
        expect((await unlock(a, 'tab-a')).statusCode).toBe(204);
        expect((await lock(b, 'tab-b')).json()).toEqual({ held: true });
    });

    it('does not let anyone else release a lock', async () => {
        await lock(a, 'tab-a');
        await unlock(b, 'tab-a'); // right editor id, wrong user
        await unlock(a, 'tab-2'); // right user, wrong editor
        expect((await lock(b, 'tab-b')).json()).toMatchObject({ held: false });
    });

    it('lets someone take over a lock nobody renewed', async () => {
        await lock(a, 'tab-a');
        await expire();
        expect((await lock(b, 'tab-b')).json()).toEqual({ held: true });
        // and now it is a who is locked out
        expect((await lock(a, 'tab-a')).json()).toEqual({
            held: false,
            holder: 'b@example.com',
        });
    });

    it('lets only one of two simultaneous requests win', async () => {
        const [r1, r2] = await Promise.all([
            lock(a, 'tab-a'),
            lock(b, 'tab-b'),
        ]);
        expect(
            [r1, r2].map((r) => r.json().held).sort()
        ).toEqual([false, true]);
        expect(await ctx.db.select().from(diagramLocks)).toHaveLength(1);
    });

    it('is only for people who can edit', async () => {
        expect((await lock(viewer, 'tab-v')).statusCode).toBe(403);
        expect((await lock(stranger, 'tab-s')).statusCode).toBe(404);
        const signedOut = await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${id}/lock`,
            payload: { editorId: 'x' },
        });
        expect(signedOut.statusCode).toBe(401);
        expect(await ctx.db.select().from(diagramLocks)).toHaveLength(0);
    });

    it('needs an editor id', async () => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${id}/lock`,
            headers: as(a),
            payload: {},
        });
        expect(res.statusCode).toBe(400);
    });

    describe('saving', () => {
        it('lets the editor holding the lock save', async () => {
            await lock(a, 'tab-a');
            const res = await save(a, 'by a', 'tab-a');
            expect(res.statusCode).toBe(200);
            expect(res.json().content).toBeUndefined();
            const stored = await ctx.app.inject({
                url: `/diagrams/${id}`,
                headers: as(a),
            });
            expect(stored.json().content.name).toBe('by a');
        });

        it('refuses a save from someone else and leaves the diagram alone', async () => {
            await lock(a, 'tab-a');
            const res = await save(b, 'by b', 'tab-b');
            expect(res.statusCode).toBe(423);
            expect(res.json()).toMatchObject({
                error: 'locked',
                holder: 'a@example.com',
                message: 'a@example.com is editing this diagram.',
            });
            const stored = await ctx.app.inject({
                url: `/diagrams/${id}`,
                headers: as(a),
            });
            expect(stored.json().content.name).not.toBe('by b');
        });

        it('refuses a save from another tab of the same user', async () => {
            await lock(a, 'tab-1');
            expect((await save(a, 'tab 2', 'tab-2')).statusCode).toBe(423);
            expect((await save(a, 'tab 1', 'tab-1')).statusCode).toBe(200);
        });

        it('refuses a title change from someone else too', async () => {
            await lock(a, 'tab-a');
            const res = await ctx.app.inject({
                method: 'PUT',
                url: `/diagrams/${id}`,
                headers: as(b),
                payload: { title: 'renamed by b', editorId: 'tab-b' },
            });
            expect(res.statusCode).toBe(423);
        });

        it('takes the lock when nobody has it, so others are kept out', async () => {
            expect((await save(a, 'first', 'tab-a')).statusCode).toBe(200);
            expect((await lock(b, 'tab-b')).json()).toMatchObject({
                held: false,
                holder: 'a@example.com',
            });
            expect((await save(b, 'second', 'tab-b')).statusCode).toBe(423);
        });

        it('renews the lock, so a long editing session is not cut off', async () => {
            await lock(a, 'tab-a');
            await expire();
            expect((await save(a, 'late', 'tab-a')).statusCode).toBe(200);
            expect((await lock(b, 'tab-b')).json()).toMatchObject({
                held: false,
            });
        });

        it('lets a save through once the lock ran out', async () => {
            await lock(a, 'tab-a');
            await expire();
            expect((await save(b, 'took over', 'tab-b')).statusCode).toBe(200);
        });

        it('treats a save without an editor id as the user\'s own API call', async () => {
            expect((await save(a, 'cli')).statusCode).toBe(200);
            expect((await save(a, 'cli again')).statusCode).toBe(200);
            expect((await save(b, 'other')).statusCode).toBe(423);
        });

        it('still refuses a save based on an old copy', async () => {
            const base = await current(a);
            await lock(a, 'tab-a');
            await save(a, 'newer', 'tab-a');
            const stale = await ctx.app.inject({
                method: 'PUT',
                url: `/diagrams/${id}`,
                headers: as(a),
                payload: {
                    content: { ...sampleContent, name: 'old base' },
                    baseUpdatedAt: base,
                    editorId: 'tab-a',
                },
            });
            expect(stale.statusCode).toBe(409);
        });
    });

    it('goes away with the diagram', async () => {
        const other = await createDiagram(ctx.app, a, 'short lived');
        expect((await lock(a, 'tab-a', other)).json()).toEqual({ held: true });
        const del = await ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${other}`,
            headers: as(a),
        });
        expect(del.statusCode).toBe(204);
        expect(await ctx.db.select().from(diagramLocks)).toHaveLength(0);
    });

    it('is let go when the user signs out', async () => {
        await lock(b, 'tab-b');
        await ctx.app.inject({
            method: 'POST',
            url: '/auth/logout',
            headers: as(b),
        });
        expect(await ctx.db.select().from(diagramLocks)).toHaveLength(0);
        expect((await lock(a, 'tab-a')).json()).toEqual({ held: true });
    });
});
