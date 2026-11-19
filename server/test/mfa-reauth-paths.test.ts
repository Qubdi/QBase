import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { totp } from '../src/auth/totp.js';
import { auditLog, users } from '../src/db/schema.js';
import {
    as,
    createTestApp,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

const KEY = 'a-test-key-of-at-least-16-chars';
const PASSWORD = 'Password-123!';
const NEW_PASSWORD = 'Another-Pass-456!';

// The places a signed-in person proves themselves again with a second factor:
// changing their own password and the admin step-up. The happy paths and a
// wrong app code are covered elsewhere; these are the recovery-code paths, the
// fail-closed path without a key, and the lockout shared across addresses.
describe('second factor when re-proving who you are', () => {
    let ctx: TestCtx;
    let counter = 0;

    // only Date is faked, so a code stays good for a test and the next one is 31 s away
    const nextStep = () => vi.setSystemTime(Date.now() + 31_000);

    beforeAll(async () => {
        // AUTH_MAX_FAILURES 2: the per-address lock is 2, the all-addresses one 10
        ctx = await createTestApp({ secretsKey: KEY, authMaxFailures: 2 });
        await registerUser(ctx.app, 'admin@example.com');
    });
    afterAll(() => ctx.close());
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    const post = (
        url: string,
        payload: object,
        who: TestUser,
        remoteAddress?: string,
        app = ctx.app
    ) =>
        app.inject({
            method: 'POST',
            url,
            payload,
            headers: as(who),
            ...(remoteAddress ? { remoteAddress } : {}),
        });

    async function enrolled(email = `mfa${++counter}@example.com`) {
        const user = await registerUser(ctx.app, email);
        const setup = await post('/auth/mfa/setup', {}, user);
        const secret: string = setup.json().secret;
        const enable = await post('/auth/mfa/enable', { password: PASSWORD, code: totp(secret) }, user);
        expect(enable.statusCode).toBe(200);
        return { user, secret, recoveryCodes: enable.json().recoveryCodes as string[] };
    }

    const hashOf = async (id: string) =>
        (await ctx.db.select({ h: users.passwordHash }).from(users).where(eq(users.id, id)))[0].h;

    const actions = async (userId: string, action: string) =>
        ctx.db
            .select({ id: auditLog.id })
            .from(auditLog)
            .where(and(eq(auditLog.userId, userId), eq(auditLog.action, action)));

    const wrongCode = (secret: string) => (totp(secret) === '000000' ? '000001' : '000000');

    describe('changing the password', () => {
        const change = (user: TestUser, extra: object, remoteAddress?: string, app = ctx.app) =>
            post(
                '/auth/change-password',
                { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, ...extra },
                user,
                remoteAddress,
                app
            );

        it('accepts a recovery code once, records it, and refuses it the second time', async () => {
            const { user, recoveryCodes } = await enrolled();
            const ok = await change(user, { recoveryCode: recoveryCodes[0] });
            expect(ok.statusCode).toBe(200);
            expect(await actions(user.id, 'mfa.recovery_used')).toHaveLength(1);
            // the password is now NEW_PASSWORD; the same code cannot change it back
            const again = await post(
                '/auth/change-password',
                {
                    currentPassword: NEW_PASSWORD,
                    newPassword: PASSWORD,
                    recoveryCode: recoveryCodes[0],
                },
                user
            );
            expect(again.statusCode).toBe(403);
            expect(again.json().error).toBe('invalid_code');
            expect(await actions(user.id, 'mfa.failed')).toHaveLength(1);
        });

        it('leaves the password alone on a wrong code or a made-up recovery code', async () => {
            const { user, secret } = await enrolled();
            const before = await hashOf(user.id);
            const wrong = await change(user, { code: wrongCode(secret) });
            expect(wrong.statusCode).toBe(403);
            const madeUp = await change(user, { recoveryCode: 'abcd-efgh-ijkl' });
            expect(madeUp.statusCode).toBe(403);
            expect(madeUp.json().error).toBe('invalid_code');
            expect(await hashOf(user.id)).toBe(before);
        });

        it('fails closed without the key that checks codes', async () => {
            const { user, secret } = await enrolled();
            const before = await hashOf(user.id);
            // the same database and session, on a server that lost SECRETS_KEY
            const bare = await createTestApp(
                { secretsKey: null, connectionKey: null, authMaxFailures: 2 },
                undefined,
                false
            );
            try {
                nextStep();
                const res = await change(user, { code: totp(secret) }, undefined, bare.app);
                expect(res.statusCode).toBe(503);
                expect(res.json().error).toBe('mfa_unavailable');
                // and a request with no code at all is still asked for one
                const none = await change(user, {}, undefined, bare.app);
                expect(none.statusCode).toBe(403);
                expect(none.json().error).toBe('mfa_code_required');
            } finally {
                await bare.close();
            }
            expect(await hashOf(user.id)).toBe(before);
        });

        it('locks the account once wrong codes from many addresses add up', async () => {
            const { user, secret } = await enrolled();
            const before = await hashOf(user.id);
            // one failure each from ten addresses: no address reaches its own
            // limit of 2, but the account reaches its limit of 10
            for (let i = 1; i <= 10; i++) {
                const res = await change(user, { code: wrongCode(secret) }, `198.51.100.${i}`);
                expect(res.statusCode).toBe(403);
            }
            nextStep();
            // the right code, from an address that never failed, is held back
            const blocked = await change(user, { code: totp(secret) }, '203.0.113.50');
            expect(blocked.statusCode).toBe(429);
            expect(blocked.json().error).toBe('too_many_attempts');
            expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
            expect(await hashOf(user.id)).toBe(before);
        });

        it('locks one address after its own failures without locking the account', async () => {
            const { user, secret } = await enrolled();
            for (let i = 0; i < 2; i++) {
                await change(user, { code: wrongCode(secret) }, '192.0.2.10');
            }
            nextStep();
            const sameAddress = await change(user, { code: totp(secret) }, '192.0.2.10');
            expect(sameAddress.statusCode).toBe(429);
            const elsewhere = await change(user, { code: totp(secret) }, '192.0.2.11');
            expect(elsewhere.statusCode).toBe(200);
        });
    });

    describe('the admin step-up', () => {
        let actor: { user: TestUser; secret: string; recoveryCodes: string[] };
        let target: TestUser;

        beforeAll(async () => {
            actor = await enrolled('stepper@example.com');
            target = await registerUser(ctx.app, 'target-admin@example.com');
            await ctx.db
                .update(users)
                .set({ isAdmin: true })
                .where(eq(users.id, actor.user.id));
            await ctx.db.update(users).set({ isAdmin: true }).where(eq(users.id, target.id));
        });

        const resetTarget = (proof: object, remoteAddress?: string) =>
            ctx.app.inject({
                method: 'PATCH',
                url: `/admin/users/${target.id}`,
                headers: as(actor.user),
                payload: { password: 'Target-Pass-789!', ...proof },
                ...(remoteAddress ? { remoteAddress } : {}),
            });

        it('takes a recovery code in place of an app code, once', async () => {
            const code = actor.recoveryCodes[1];
            const ok = await resetTarget({ adminPassword: PASSWORD, adminCode: code });
            expect(ok.statusCode).toBe(200);
            expect(await actions(actor.user.id, 'mfa.recovery_used')).toHaveLength(1);
            const reused = await resetTarget({ adminPassword: PASSWORD, adminCode: code });
            expect(reused.statusCode).toBe(403);
            expect(reused.json().error).toBe('invalid_code');
        });

        it('refuses a made-up recovery code and keeps the target’s password', async () => {
            const before = await hashOf(target.id);
            const res = await resetTarget({
                adminPassword: PASSWORD,
                adminCode: 'not-a-real-code',
            });
            expect(res.statusCode).toBe(403);
            expect(res.json().error).toBe('invalid_code');
            expect(await hashOf(target.id)).toBe(before);
        });

        it('shares its code lockout with changing the password', async () => {
            const address = '192.0.2.77';
            for (let i = 0; i < 2; i++) {
                const res = await resetTarget(
                    { adminPassword: PASSWORD, adminCode: wrongCode(actor.secret) },
                    address
                );
                expect(res.statusCode).toBe(403);
            }
            nextStep();
            // the lock reached through the step-up holds at the password screen
            const change = await post(
                '/auth/change-password',
                {
                    currentPassword: PASSWORD,
                    newPassword: NEW_PASSWORD,
                    code: totp(actor.secret),
                },
                actor.user,
                address
            );
            expect(change.statusCode).toBe(429);
            const stepUp = await resetTarget(
                { adminPassword: PASSWORD, adminCode: totp(actor.secret) },
                address
            );
            expect(stepUp.statusCode).toBe(429);
        });
    });
});
