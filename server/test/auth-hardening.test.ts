import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, sessions } from '../src/db/schema.js';
import { as, createTestApp, loginUser, registerUser, type TestCtx, type TestUser } from './helpers.js';

describe('auth hardening', () => {
    let ctx: TestCtx;
    let user: TestUser;

    const changePassword = (payload: object) =>
        ctx.app.inject({ method: 'POST', url: '/auth/change-password', headers: as(user), payload });
    const actions = async () => (await ctx.db.select().from(auditLog)).map((r) => r.action);

    beforeAll(async () => {
        ctx = await createTestApp();
        await registerUser(ctx.app, 'admin@example.com');
        user = await loginUser(ctx.app, 'admin@example.com');
    });
    afterAll(() => ctx.close());

    it('refuses a current password longer than any the server accepts, before hashing it', async () => {
        const res = await changePassword({
            currentPassword: 'x'.repeat(201),
            newPassword: 'Password-456!-long',
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('invalid_request');
    });

    it('logs a wrong current password as its own action, not as a failed sign-in', async () => {
        const before = (await actions()).length;
        const res = await changePassword({ currentPassword: 'not-the-password', newPassword: 'Password-456!-long' });
        expect(res.statusCode).toBe(403);
        expect((await actions()).slice(before)).toEqual(['user.password_check_failed']);
    });

    it('records a sign-out, and only when someone was signed in', async () => {
        const before = (await actions()).length;
        const nobody = await ctx.app.inject({ method: 'POST', url: '/auth/logout' });
        expect(nobody.statusCode).toBe(200);
        expect((await actions()).slice(before)).toEqual([]);

        const out = await ctx.app.inject({ method: 'POST', url: '/auth/logout', headers: as(user) });
        expect(out.statusCode).toBe(200);
        const rows = (await ctx.db.select().from(auditLog)).slice(before);
        expect(rows.map((r) => r.action)).toEqual(['user.logout']);
        expect(rows[0].userId).toBe(user.id);
    });
});

describe('idle sessions', () => {
    const ageSession = (ctx: TestCtx, days: number) =>
        ctx.db.update(sessions).set({ lastSeenAt: new Date(Date.now() - days * 86_400_000) });
    const me = (ctx: TestCtx, who: TestUser) => ctx.app.inject({ url: '/auth/me', headers: as(who) });

    it('ends a session unused for longer than the idle limit, and keeps a recent one', async () => {
        const ctx = await createTestApp({ sessionIdleDays: 14 });
        try {
            await registerUser(ctx.app, 'idle@example.com');
            const who = await loginUser(ctx.app, 'idle@example.com');
            expect((await me(ctx, who)).statusCode).toBe(200);
            await ageSession(ctx, 10);
            expect((await me(ctx, who)).statusCode).toBe(200);
            await ageSession(ctx, 15);
            expect((await me(ctx, who)).statusCode).toBe(401);
        } finally {
            await ctx.close();
        }
    });

    it('0 turns the idle limit off', async () => {
        const ctx = await createTestApp({ sessionIdleDays: 0 });
        try {
            await registerUser(ctx.app, 'idle@example.com');
            const who = await loginUser(ctx.app, 'idle@example.com');
            await ageSession(ctx, 25);
            expect((await me(ctx, who)).statusCode).toBe(200);
        } finally {
            await ctx.close();
        }
    });
});
