import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    createSession,
    getSessionUser,
    LAST_SEEN_SECONDS,
    MAX_USER_AGENT_LENGTH,
} from '../src/auth/sessions.js';
import { sessions, users } from '../src/db/schema.js';
import {
    as,
    createTestApp,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

describe('sign-in tracking', () => {
    let ctx: TestCtx;
    let admin: TestUser;

    const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

    const lastLogin = async (userId: string) =>
        (
            await ctx.db
                .select({ at: users.lastLoginAt })
                .from(users)
                .where(eq(users.id, userId))
        )[0].at;

    const sessionOf = async (userId: string) =>
        (
            await ctx.db
                .select()
                .from(sessions)
                .where(eq(sessions.userId, userId))
        )[0];

    /** An account made by the admin that has never signed in. */
    const newAccount = async (email: string) => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/admin/users',
            headers: as(admin),
            payload: { email, password: 'Password-123!' },
        });
        expect(res.statusCode).toBe(201);
        return res.json().id as string;
    };

    const signIn = (
        email: string,
        headers: Record<string, string> = {},
        password = 'Password-123!'
    ) =>
        ctx.app.inject({
            method: 'POST',
            url: '/auth/login',
            headers,
            payload: { email, password },
        });

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
    });
    afterAll(() => ctx.close());

    describe('last sign-in', () => {
        it('is set when the first admin signs up', async () => {
            const at = await lastLogin(admin.id);
            expect(at).not.toBeNull();
            expect(Math.abs(Date.now() - at!.getTime())).toBeLessThan(60_000);
        });

        it('is empty for an account nobody has signed in to', async () => {
            const id = await newAccount('fresh@example.com');
            expect(await lastLogin(id)).toBeNull();
        });

        it('is set by a sign-in and moves forward on the next one', async () => {
            const id = await newAccount('ann@example.com');
            expect((await signIn('ann@example.com')).statusCode).toBe(200);
            const first = await lastLogin(id);
            expect(first).not.toBeNull();

            await ctx.db
                .update(users)
                .set({ lastLoginAt: minutesAgo(30) })
                .where(eq(users.id, id));
            expect((await signIn('ann@example.com')).statusCode).toBe(200);
            const second = await lastLogin(id);
            expect(second!.getTime()).toBeGreaterThan(Date.now() - 60_000);
        });

        it('is not set by a wrong password', async () => {
            const id = await newAccount('bob@example.com');
            const res = await signIn('bob@example.com', {}, 'not-the-password');
            expect(res.statusCode).toBe(401);
            expect(await lastLogin(id)).toBeNull();
        });

        it('is not set for a disabled account', async () => {
            const id = await newAccount('dave@example.com');
            await ctx.app.inject({
                method: 'PATCH',
                url: `/admin/users/${id}`,
                headers: as(admin),
                payload: { isActive: false },
            });
            expect((await signIn('dave@example.com')).statusCode).toBe(403);
            expect(await lastLogin(id)).toBeNull();
        });
    });

    describe('the browser kept on the session', () => {
        it('is stored with the session and with when it started', async () => {
            const id = await newAccount('carol@example.com');
            await signIn('carol@example.com', { 'user-agent': 'Firefox/130 test' });
            const row = await sessionOf(id);
            expect(row.userAgent).toBe('Firefox/130 test');
            expect(Math.abs(Date.now() - row.createdAt.getTime())).toBeLessThan(
                60_000
            );
            expect(
                Math.abs(row.lastSeenAt.getTime() - row.createdAt.getTime())
            ).toBeLessThan(60_000);
        });

        it('is cut to 200 characters', async () => {
            const id = await newAccount('long@example.com');
            const agent = 'x'.repeat(MAX_USER_AGENT_LENGTH + 100);
            await signIn('long@example.com', { 'user-agent': agent });
            const row = await sessionOf(id);
            expect(row.userAgent).toHaveLength(MAX_USER_AGENT_LENGTH);
            expect(row.userAgent).toBe(agent.slice(0, MAX_USER_AGENT_LENGTH));
        });

        it('is empty when the browser sent none', async () => {
            const id = await newAccount('quiet@example.com');
            await createSession(ctx.db, id, 30);
            expect((await sessionOf(id)).userAgent).toBeNull();
        });

        it('is not changed by later requests', async () => {
            const id = await newAccount('steady@example.com');
            const res = await signIn('steady@example.com', {
                'user-agent': 'Original/1',
            });
            const cookie = `qbase_session=${res.cookies[0].value}`;
            await ctx.db
                .update(sessions)
                .set({ lastSeenAt: minutesAgo(10) })
                .where(eq(sessions.userId, id));
            await ctx.app.inject({
                url: '/auth/me',
                headers: { cookie, 'user-agent': 'Different/2' },
            });
            expect((await sessionOf(id)).userAgent).toBe('Original/1');
        });
    });

    describe('when the session was last used', () => {
        let id: string;
        let cookie: string;

        const me = (headers: Record<string, string> = { cookie }) =>
            ctx.app.inject({ url: '/auth/me', headers });

        beforeAll(async () => {
            id = await newAccount('seen@example.com');
            const res = await signIn('seen@example.com');
            cookie = `qbase_session=${res.cookies[0].value}`;
        });

        it('is written when it is older than the interval', async () => {
            expect(LAST_SEEN_SECONDS).toBe(300);
            await ctx.db
                .update(sessions)
                .set({ lastSeenAt: minutesAgo(10) })
                .where(eq(sessions.userId, id));
            expect((await me()).statusCode).toBe(200);
            const seen = (await sessionOf(id)).lastSeenAt;
            expect(Date.now() - seen.getTime()).toBeLessThan(60_000);
        });

        it('is left alone when it is more recent than that', async () => {
            const recent = minutesAgo(1);
            await ctx.db
                .update(sessions)
                .set({ lastSeenAt: recent })
                .where(eq(sessions.userId, id));
            expect((await me()).statusCode).toBe(200);
            expect((await sessionOf(id)).lastSeenAt.getTime()).toBe(
                recent.getTime()
            );
        });

        it('is checked against the interval, not the first request after it', async () => {
            const justInside = new Date(Date.now() - (LAST_SEEN_SECONDS - 30) * 1000);
            await ctx.db
                .update(sessions)
                .set({ lastSeenAt: justInside })
                .where(eq(sessions.userId, id));
            await me();
            expect((await sessionOf(id)).lastSeenAt.getTime()).toBe(
                justInside.getTime()
            );
        });

        it('settles on a recent time when several requests arrive together', async () => {
            await ctx.db
                .update(sessions)
                .set({ lastSeenAt: minutesAgo(20) })
                .where(eq(sessions.userId, id));
            const all = await Promise.all(Array.from({ length: 8 }, () => me()));
            expect(all.map((r) => r.statusCode)).toEqual(Array(8).fill(200));
            const seen = (await sessionOf(id)).lastSeenAt;
            expect(Date.now() - seen.getTime()).toBeLessThan(60_000);
        });

        it('is not touched by a request that has no session', async () => {
            const before = (await sessionOf(id)).lastSeenAt.getTime();
            expect((await me({})).statusCode).toBe(401);
            expect((await sessionOf(id)).lastSeenAt.getTime()).toBe(before);
        });

        it('does not fail the request when it cannot be written', async () => {
            await ctx.db
                .update(sessions)
                .set({ lastSeenAt: minutesAgo(20) })
                .where(eq(sessions.userId, id));
            // the same database, except that every update fails
            const failing = new Proxy(ctx.db, {
                get: (target, prop, receiver) =>
                    prop === 'update'
                        ? () => ({
                              set: () => ({
                                  where: () =>
                                      Promise.reject(new Error('disk full')),
                              }),
                          })
                        : Reflect.get(target, prop, receiver),
            });
            const token = cookie.split('=')[1];
            const user = await getSessionUser(failing, token);
            expect(user?.email).toBe('seen@example.com');
        });
    });
});
