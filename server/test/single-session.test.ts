import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diagramLocks, sessions } from '../src/db/schema.js';
import {
    as,
    createDiagram,
    createTestApp,
    loginUser,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

describe('one live session per user', () => {
    let ctx: TestCtx;
    let user: TestUser;
    let other: TestUser;

    const me = (who: { cookie: string }) =>
        ctx.app.inject({ url: '/auth/me', headers: as(who as TestUser) });

    beforeAll(async () => {
        ctx = await createTestApp();
        await registerUser(ctx.app, 'admin@example.com');
        user = await registerUser(ctx.app, 'user@example.com');
        other = await registerUser(ctx.app, 'other@example.com');
        await registerUser(ctx.app, 'editor@example.com');
    });
    afterAll(() => ctx.close());

    it('ends the older session when the same account signs in again', async () => {
        const first = await loginUser(ctx.app, 'user@example.com');
        expect((await me(first)).statusCode).toBe(200);

        const second = await loginUser(ctx.app, 'user@example.com');
        expect((await me(first)).statusCode).toBe(401);
        expect((await me(second)).statusCode).toBe(200);
    });

    it('keeps exactly one session row for the account', async () => {
        await loginUser(ctx.app, 'user@example.com');
        await loginUser(ctx.app, 'user@example.com');
        const rows = await ctx.db
            .select()
            .from(sessions)
            .where(eq(sessions.userId, user.id));
        expect(rows).toHaveLength(1);
    });

    it('leaves one session when the account signs in twice at once', async () => {
        const settled = await Promise.all([
            loginUser(ctx.app, 'user@example.com'),
            loginUser(ctx.app, 'user@example.com'),
            loginUser(ctx.app, 'user@example.com'),
        ]);
        const rows = await ctx.db
            .select()
            .from(sessions)
            .where(eq(sessions.userId, user.id));
        expect(rows).toHaveLength(1);
        const live = await Promise.all(settled.map((s) => me(s)));
        expect(live.filter((r) => r.statusCode === 200)).toHaveLength(1);
    });

    it('does not touch the sessions of other accounts', async () => {
        await loginUser(ctx.app, 'user@example.com');
        expect((await me(other)).statusCode).toBe(200);
    });

    it('is not ended by someone who fails to sign in', async () => {
        const live = await loginUser(ctx.app, 'user@example.com');
        const bad = await ctx.app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: 'user@example.com', password: 'not-the-password' },
        });
        expect(bad.statusCode).toBe(401);
        expect((await me(live)).statusCode).toBe(200);
    });

    it('lets the account sign in again after signing out', async () => {
        const first = await loginUser(ctx.app, 'user@example.com');
        await ctx.app.inject({
            method: 'POST',
            url: '/auth/logout',
            headers: as(first),
        });
        const again = await loginUser(ctx.app, 'user@example.com');
        expect((await me(again)).statusCode).toBe(200);
    });

    it('lets go of the diagrams the old session was editing', async () => {
        const old = await loginUser(ctx.app, 'editor@example.com');
        const id = await createDiagram(ctx.app, old);
        await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${id}/lock`,
            headers: as(old),
            payload: { editorId: 'old-tab' },
        });
        expect(await ctx.db.select().from(diagramLocks)).toHaveLength(1);

        const fresh = await loginUser(ctx.app, 'editor@example.com');
        expect(await ctx.db.select().from(diagramLocks)).toHaveLength(0);
        // the new session can edit straight away, without waiting for a timeout
        const lock = await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${id}/lock`,
            headers: as(fresh),
            payload: { editorId: 'new-tab' },
        });
        expect(lock.json()).toEqual({ held: true });
    });
});
