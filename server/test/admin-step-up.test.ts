import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { totp } from '../src/auth/totp.js';
import { auditLog, users } from '../src/db/schema.js';
import {
    as,
    createTestApp,
    loginUser,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

const KEY = 'a-test-key-of-at-least-16-chars';
const PASSWORD = 'Password-123!';
const NEW = 'A-brand-new-pass-1!';

describe('resetting another admin: the acting admin proves who they are', () => {
    let ctx: TestCtx;
    let root: TestUser;
    let other: TestUser; // a second admin
    let member: TestUser;

    const send = (
        who: TestUser,
        method: 'PATCH' | 'POST',
        url: string,
        payload?: object
    ) => ctx.app.inject({ method, url, headers: as(who), payload });
    const reset = (target: TestUser, extra: object = {}, who = root) =>
        send(who, 'PATCH', `/admin/users/${target.id}`, { password: NEW, ...extra });
    const hashOf = async (id: string) =>
        (await ctx.db.select({ h: users.passwordHash }).from(users).where(eq(users.id, id)))[0].h;

    beforeAll(async () => {
        // a small lockout, so the shared counter can be reached in a test
        ctx = await createTestApp({ secretsKey: KEY, authMaxFailures: 4 });
        root = await registerUser(ctx.app, 'root@example.com');
        other = await registerUser(ctx.app, 'other@example.com');
        member = await registerUser(ctx.app, 'member@example.com');
        await ctx.db.update(users).set({ isAdmin: true }).where(eq(users.id, other.id));
    });
    afterAll(() => ctx.close());

    describe('a password reset', () => {
        it('needs no proof for an account that is not an admin', async () => {
            const res = await reset(member);
            expect(res.statusCode).toBe(200);
        });

        it('refuses another admin with no proof, and leaves the password alone', async () => {
            const before = await hashOf(other.id);
            const res = await reset(other);
            expect(res.statusCode).toBe(403);
            expect(res.json().error).toBe('step_up_required');
            expect(await hashOf(other.id)).toBe(before);
        });

        it('refuses a wrong password, records it, and leaves the password alone', async () => {
            const before = await hashOf(other.id);
            const res = await reset(other, { adminPassword: 'not-the-password' });
            expect(res.statusCode).toBe(403);
            expect(res.json().error).toBe('wrong_password');
            expect(await hashOf(other.id)).toBe(before);
            const rows = await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'user.password_check_failed'));
            expect(rows.some((r) => r.userId === root.id)).toBe(true);
        });

        it('goes through with the acting admin\'s own password', async () => {
            const before = await hashOf(other.id);
            const res = await reset(other, { adminPassword: PASSWORD });
            expect(res.statusCode).toBe(200);
            expect(await hashOf(other.id)).not.toBe(before);
        });

        it('counts wrong passwords against the lockout the account screens use', async () => {
            // a right password cleared the count; four wrong ones (AUTH_MAX_FAILURES) lock it
            for (let i = 0; i < 4; i++) await reset(other, { adminPassword: 'nope' });
            const locked = await reset(other, { adminPassword: PASSWORD });
            expect(locked.statusCode).toBe(429);
            // change-password is held by the same counter
            const change = await send(root, 'POST', '/auth/change-password', {
                currentPassword: PASSWORD,
                newPassword: NEW,
            });
            expect(change.statusCode).toBe(429);
        });
    });

    describe('with two-factor on for the acting admin', () => {
        let admin2: TestUser;
        let secret: string;
        let ctx2: TestCtx;

        beforeAll(async () => {
            // a fresh app and counters, so the lockout above does not carry over
            ctx2 = await createTestApp({ secretsKey: KEY }, undefined, false);
            // the reset above made NEW a temporary password; its owner has now chosen it
            await ctx2.db.update(users).set({ mustChangePassword: false }).where(eq(users.id, other.id));
            admin2 = await loginUser(ctx2.app, 'other@example.com', NEW);
            secret = await (async () => {
                const setup = await ctx2.app.inject({ method: 'POST', url: '/auth/mfa/setup', headers: as(admin2), payload: {} });
                const s = setup.json().secret as string;
                const enable = await ctx2.app.inject({
                    method: 'POST',
                    url: '/auth/mfa/enable',
                    headers: as(admin2),
                    payload: { password: NEW, code: totp(s) },
                });
                expect(enable.statusCode).toBe(200);
                return s;
            })();
            // `root` is the admin being reset here
        });
        afterAll(() => ctx2.close());

        const resetRoot = (extra: object) =>
            ctx2.app.inject({
                method: 'PATCH',
                url: `/admin/users/${root.id}`,
                headers: as(admin2),
                payload: { password: PASSWORD + 'x', ...extra },
            });

        it('also asks for a code', async () => {
            const res = await resetRoot({ adminPassword: NEW });
            expect(res.statusCode).toBe(403);
            expect(res.json().error).toBe('mfa_code_required');
        });

        it('refuses a wrong code', async () => {
            const wrong = totp(secret, Date.now() + 30_000) === '000000' ? '000001' : '000000';
            const res = await resetRoot({ adminPassword: NEW, adminCode: wrong });
            expect(res.statusCode).toBe(403);
            expect(res.json().error).toBe('invalid_code');
        });

        it('accepts the code from the app', async () => {
            const res = await resetRoot({ adminPassword: NEW, adminCode: totp(secret, Date.now() + 30_000) });
            expect(res.statusCode).toBe(200);
        });
    });

    describe('a two-factor reset', () => {
        let ctx3: TestCtx;
        let a: TestUser;
        let b: TestUser;
        let m: TestUser;

        beforeAll(async () => {
            ctx3 = await createTestApp({ secretsKey: KEY });
            a = await registerUser(ctx3.app, 'a@example.com');
            b = await registerUser(ctx3.app, 'b@example.com');
            m = await registerUser(ctx3.app, 'm@example.com');
            await ctx3.db.update(users).set({ isAdmin: true }).where(eq(users.id, b.id));
            for (const user of [b, m]) {
                const setup = await ctx3.app.inject({ method: 'POST', url: '/auth/mfa/setup', headers: as(user), payload: {} });
                const enable = await ctx3.app.inject({
                    method: 'POST',
                    url: '/auth/mfa/enable',
                    headers: as(user),
                    payload: { password: PASSWORD, code: totp(setup.json().secret) },
                });
                expect(enable.statusCode).toBe(200);
            }
        });
        afterAll(() => ctx3.close());

        const mfaReset = (target: TestUser, payload?: object) =>
            ctx3.app.inject({ method: 'POST', url: `/admin/users/${target.id}/mfa/reset`, headers: as(a), payload });

        it('needs no proof for an account that is not an admin', async () => {
            expect((await mfaReset(m)).json()).toEqual({ reset: true });
        });

        it('refuses another admin with no proof or a wrong password, and keeps their two-factor', async () => {
            const none = await mfaReset(b);
            expect(none.statusCode).toBe(403);
            expect(none.json().error).toBe('step_up_required');
            const wrong = await mfaReset(b, { adminPassword: 'nope' });
            expect(wrong.statusCode).toBe(403);
            expect(wrong.json().error).toBe('wrong_password');
            const [row] = await ctx3.db.select().from(users).where(eq(users.id, b.id));
            expect(row.mfaEnabledAt).not.toBeNull();
        });

        it('clears it with the acting admin\'s own password', async () => {
            const res = await mfaReset(b, { adminPassword: PASSWORD });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ reset: true });
            const [row] = await ctx3.db.select().from(users).where(eq(users.id, b.id));
            expect(row.mfaEnabledAt).toBeNull();
        });
    });
});
