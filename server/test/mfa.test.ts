import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditLog, mfaChallenges, mfaRecoveryCodes, users } from '../src/db/schema.js';
import { totp } from '../src/auth/totp.js';
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

// Time stands still unless a test moves it, so a code is good for the whole
// test and "the next code" is one move of 31 seconds away. Only Date is
// faked: the database and the HTTP stack keep their real timers.
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);
const nextStep = () => advance(31_000);

describe('two-factor sign-in', () => {
    let ctx: TestCtx;
    let counter = 0;

    beforeAll(async () => {
        ctx = await createTestApp({ secretsKey: KEY });
        await registerUser(ctx.app, 'admin@example.com');
    });
    afterAll(() => ctx.close());
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    const post = (url: string, payload: object, who?: { cookie: string }) =>
        ctx.app.inject({
            method: 'POST',
            url,
            payload,
            headers: who ? as(who as TestUser) : undefined,
        });

    /** A new account with two-factor on; returns what a test needs to sign in. */
    async function enrolled() {
        const user = await registerUser(ctx.app, `mfa${++counter}@example.com`);
        const setup = await post('/auth/mfa/setup', {}, user);
        expect(setup.statusCode).toBe(200);
        const { secret } = setup.json();
        const enable = await post('/auth/mfa/enable', { code: totp(secret) }, user);
        expect(enable.statusCode).toBe(200);
        const recoveryCodes: string[] = enable.json().recoveryCodes;
        return { user, secret, recoveryCodes };
    }

    const password = (email: string) =>
        post('/auth/login', { email, password: PASSWORD });

    /** Both steps; returns the second response. */
    async function signIn(email: string, body: object) {
        const first = await password(email);
        expect(first.json().mfaRequired).toBe(true);
        return post('/auth/login/mfa', { challenge: first.json().challenge, ...body });
    }

    describe('availability', () => {
        it('is offered when there is a key', async () => {
            const res = await ctx.app.inject({ url: '/auth/setup-status' });
            expect(res.json().mfaAvailable).toBe(true);
        });

        it('is simply not offered without a key: no error, no set-up', async () => {
            const bare = await createTestApp({ secretsKey: null }, undefined, false);
            try {
                const status = await bare.app.inject({ url: '/auth/setup-status' });
                expect(status.statusCode).toBe(200);
                expect(status.json().mfaAvailable).toBe(false);
                const user = await loginUser(bare.app, 'admin@example.com');
                const setup = await bare.app.inject({
                    method: 'POST',
                    url: '/auth/mfa/setup',
                    payload: {},
                    headers: as(user),
                });
                expect(setup.statusCode).toBe(503);
                expect(setup.json().error).toBe('mfa_unavailable');
                const mine = await bare.app.inject({ url: '/auth/mfa', headers: as(user) });
                expect(mine.json().available).toBe(false);
            } finally {
                await bare.close();
            }
        });

        it('MFA_ENABLED=false removes the endpoints', async () => {
            const off = await createTestApp({ secretsKey: KEY, mfaEnabled: false }, undefined, false);
            try {
                const user = await loginUser(off.app, 'admin@example.com');
                for (const [method, url] of [
                    ['GET', '/auth/mfa'],
                    ['POST', '/auth/mfa/setup'],
                    ['POST', '/auth/mfa/enable'],
                    ['POST', '/auth/mfa/disable'],
                    ['POST', '/auth/mfa/recovery-codes'],
                    ['POST', '/auth/login/mfa'],
                ] as const) {
                    const res = await off.app.inject({ method, url, payload: {}, headers: as(user) });
                    expect(res.statusCode, `${method} ${url}`).toBe(404);
                }
                const status = await off.app.inject({ url: '/auth/setup-status' });
                expect(status.json().mfaAvailable).toBe(false);
            } finally {
                await off.close();
            }
        });
    });

    describe('setting it up', () => {
        it('needs a signed-in person', async () => {
            expect((await post('/auth/mfa/setup', {})).statusCode).toBe(401);
            expect((await post('/auth/mfa/enable', { code: '123456' })).statusCode).toBe(401);
            expect((await ctx.app.inject({ url: '/auth/mfa' })).statusCode).toBe(401);
        });

        it('returns the address for the QR code and the key to type, and stays off until a code is checked', async () => {
            const user = await registerUser(ctx.app, `mfa${++counter}@example.com`);
            const res = await post('/auth/mfa/setup', {}, user);
            const { secret, otpauthUrl } = res.json();
            expect(secret).toMatch(/^[A-Z2-7]{32}$/);
            const url = new URL(otpauthUrl);
            expect(url.protocol).toBe('otpauth:');
            expect(url.searchParams.get('secret')).toBe(secret);
            expect(decodeURIComponent(url.pathname)).toContain(user.email);

            const status = await ctx.app.inject({ url: '/auth/mfa', headers: as(user) });
            expect(status.json()).toMatchObject({ available: true, enabled: false });
            // still only a password
            expect((await password(user.email)).json().mfaRequired).toBeUndefined();
        });

        it('refuses a wrong code and a code before set-up', async () => {
            const user = await registerUser(ctx.app, `mfa${++counter}@example.com`);
            expect((await post('/auth/mfa/enable', { code: '123456' }, user)).json().error).toBe(
                'setup_first'
            );
            const { secret } = (await post('/auth/mfa/setup', {}, user)).json();
            const wrong = totp(secret) === '000000' ? '000001' : '000000';
            const res = await post('/auth/mfa/enable', { code: wrong }, user);
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toBe('invalid_code');
            expect((await ctx.app.inject({ url: '/auth/me', headers: as(user) })).json().mfaEnabled).toBe(false);
        });

        it('switches on with a real code and shows ten recovery codes, once', async () => {
            const { user, recoveryCodes } = await enrolled();
            expect(recoveryCodes).toHaveLength(10);
            expect(new Set(recoveryCodes).size).toBe(10);
            const me = await ctx.app.inject({ url: '/auth/me', headers: as(user) });
            expect(me.json().mfaEnabled).toBe(true);
            const status = await ctx.app.inject({ url: '/auth/mfa', headers: as(user) });
            expect(status.json()).toMatchObject({ enabled: true, recoveryCodesLeft: 10 });
            expect(status.json().enabledAt).toBeTruthy();
            // a second set-up while on is refused
            expect((await post('/auth/mfa/setup', {}, user)).statusCode).toBe(409);
            expect((await post('/auth/mfa/enable', { code: '123456' }, user)).statusCode).toBe(409);
        });

        it('stores the secret encrypted and the recovery codes hashed; nothing returns them again', async () => {
            const { user, secret, recoveryCodes } = await enrolled();
            const [row] = await ctx.db.select().from(users).where(eq(users.id, user.id));
            expect(row.mfaSecretEnc).toMatch(/^v1:/);
            expect(row.mfaSecretEnc).not.toContain(secret);
            const stored = await ctx.db
                .select()
                .from(mfaRecoveryCodes)
                .where(eq(mfaRecoveryCodes.userId, user.id));
            expect(stored).toHaveLength(10);
            for (const code of recoveryCodes) {
                expect(JSON.stringify(stored)).not.toContain(code);
            }

            // every response the person can get afterwards
            nextStep();
            const seen: string[] = [];
            seen.push((await ctx.app.inject({ url: '/auth/me', headers: as(user) })).body);
            seen.push((await ctx.app.inject({ url: '/auth/mfa', headers: as(user) })).body);
            seen.push((await password(user.email)).body);
            seen.push((await signIn(user.email, { code: totp(secret) })).body);
            const admin = await loginUser(ctx.app, 'admin@example.com');
            seen.push((await ctx.app.inject({ url: '/admin/users', headers: as(admin) })).body);
            for (const body of seen) {
                expect(body).not.toContain(secret);
                expect(body).not.toContain('mfa_secret_enc');
                expect(body).not.toContain('mfaSecretEnc');
                for (const code of recoveryCodes) expect(body).not.toContain(code);
            }
        });

        it('records the switch-on in the activity log', async () => {
            const { user } = await enrolled();
            const rows = await ctx.db.select().from(auditLog).where(eq(auditLog.userId, user.id));
            expect(rows.map((r) => r.action)).toContain('mfa.enable');
        });
    });

    describe('signing in', () => {
        it('after the password gives a ticket and no cookie', async () => {
            const { user } = await enrolled();
            const res = await password(user.email);
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({
                mfaRequired: true,
                challenge: expect.any(String),
            });
            expect(res.cookies).toHaveLength(0);
        });

        it('a ticket is no session', async () => {
            const { user } = await enrolled();
            const res = await password(user.email);
            const me = await ctx.app.inject({
                url: '/auth/me',
                headers: { cookie: `qubdidb_session=${res.json().challenge}` },
            });
            expect(me.statusCode).toBe(401);
        });

        it('a right code starts the session', async () => {
            const { user, secret } = await enrolled();
            nextStep();
            const res = await signIn(user.email, { code: totp(secret) });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toMatchObject({ email: user.email, mfaEnabled: true });
            const cookie = res.cookies.find((c) => c.name === 'qubdidb_session')!;
            const me = await ctx.app.inject({
                url: '/auth/me',
                headers: { cookie: `qubdidb_session=${cookie.value}` },
            });
            expect(me.statusCode).toBe(200);
            const [row] = await ctx.db.select().from(users).where(eq(users.id, user.id));
            expect(row.lastLoginAt).not.toBeNull();
        });

        it('accepts the code one step either side of now, not two', async () => {
            const { user, secret } = await enrolled();
            nextStep();
            const early = totp(secret, Date.now() + 30_000);
            expect((await signIn(user.email, { code: early })).statusCode).toBe(200);
            nextStep();
            const tooEarly = totp(secret, Date.now() + 60_000);
            const res = await signIn(user.email, { code: tooEarly });
            expect(res.statusCode).toBe(401);
            expect(res.json().error).toBe('invalid_code');
        });

        it('refuses a code that was already used, even on a new ticket', async () => {
            const { user, secret } = await enrolled();
            nextStep();
            const code = totp(secret);
            expect((await signIn(user.email, { code })).statusCode).toBe(200);
            const again = await signIn(user.email, { code });
            expect(again.statusCode).toBe(401);
            // the next code is fine
            nextStep();
            expect((await signIn(user.email, { code: totp(secret) })).statusCode).toBe(200);
        });

        it('refuses a wrong code and says nothing about why', async () => {
            const { user, secret } = await enrolled();
            nextStep();
            const wrong = totp(secret) === '000000' ? '000001' : '000000';
            const res = await signIn(user.email, { code: wrong });
            expect(res.statusCode).toBe(401);
            expect(res.json()).toEqual({ error: 'invalid_code' });
            expect(res.cookies).toHaveLength(0);
        });

        it('a ticket works once', async () => {
            const { user, secret } = await enrolled();
            nextStep();
            const first = await password(user.email);
            const challenge = first.json().challenge;
            const code = totp(secret);
            expect((await post('/auth/login/mfa', { challenge, code })).statusCode).toBe(200);
            nextStep();
            const reuse = await post('/auth/login/mfa', { challenge, code: totp(secret) });
            expect(reuse.statusCode).toBe(401);
            expect(reuse.json().error).toBe('invalid_challenge');
        });

        it('a ticket dies after five wrong codes: the person starts again from the password', async () => {
            const { user, secret } = await enrolled();
            nextStep();
            const first = await password(user.email);
            const challenge = first.json().challenge;
            const wrong = totp(secret) === '000000' ? '000001' : '000000';
            for (let i = 0; i < 5; i++) {
                const res = await post('/auth/login/mfa', { challenge, code: wrong });
                expect(res.json().error).toBe('invalid_code');
            }
            const right = await post('/auth/login/mfa', { challenge, code: totp(secret) });
            expect(right.statusCode).toBe(401);
            expect(right.json().error).toBe('invalid_challenge');
            // a fresh password step gives a working ticket
            expect((await signIn(user.email, { code: totp(secret) })).statusCode).toBe(200);
        });

        it('a ticket lasts five minutes', async () => {
            const { user, secret } = await enrolled();
            const first = await password(user.email);
            advance(5 * 60_000 + 1000);
            const res = await post('/auth/login/mfa', {
                challenge: first.json().challenge,
                code: totp(secret),
            });
            expect(res.statusCode).toBe(401);
            expect(res.json().error).toBe('invalid_challenge');
        });

        it('a new password step replaces the older ticket', async () => {
            const { user, secret } = await enrolled();
            nextStep();
            const old = (await password(user.email)).json().challenge;
            await password(user.email);
            const res = await post('/auth/login/mfa', { challenge: old, code: totp(secret) });
            expect(res.statusCode).toBe(401);
            const rows = await ctx.db.select().from(mfaChallenges).where(eq(mfaChallenges.userId, user.id));
            expect(rows).toHaveLength(1);
        });

        it('refuses an unknown ticket and a body with both or neither factor', async () => {
            const { user, secret } = await enrolled();
            expect((await post('/auth/login/mfa', { challenge: 'nope', code: '123456' })).statusCode).toBe(401);
            const challenge = (await password(user.email)).json().challenge;
            expect((await post('/auth/login/mfa', { challenge })).statusCode).toBe(400);
            expect(
                (await post('/auth/login/mfa', { challenge, code: totp(secret), recoveryCode: 'AAAAA-AAAAA' }))
                    .statusCode
            ).toBe(400);
        });

        it('a wrong password never reaches the second step', async () => {
            const { user } = await enrolled();
            const res = await post('/auth/login', { email: user.email, password: 'wrong-password-1' });
            expect(res.statusCode).toBe(401);
            expect(res.json().challenge).toBeUndefined();
        });

        it('a disabled account gets no ticket', async () => {
            const { user } = await enrolled();
            await ctx.db.update(users).set({ isActive: false }).where(eq(users.id, user.id));
            const res = await password(user.email);
            expect(res.statusCode).toBe(403);
            await ctx.db.update(users).set({ isActive: true }).where(eq(users.id, user.id));
        });

        it('an account without it signs in exactly as before', async () => {
            const plain = await registerUser(ctx.app, `plain${++counter}@example.com`);
            const res = await password(plain.email);
            expect(res.statusCode).toBe(200);
            expect(res.json()).toMatchObject({ email: plain.email, mfaEnabled: false });
            expect(res.cookies.find((c) => c.name === 'qubdidb_session')).toBeTruthy();
        });

        it('with two-factor on but the key gone, fails closed', async () => {
            const { user } = await enrolled();
            const bare = await createTestApp({ secretsKey: null }, undefined, false);
            try {
                const res = await bare.app.inject({
                    method: 'POST',
                    url: '/auth/login',
                    payload: { email: user.email, password: PASSWORD },
                });
                expect(res.statusCode).toBe(503);
                expect(res.cookies).toHaveLength(0);
            } finally {
                await bare.close();
            }
        });

        it('records wrong codes in the activity log', async () => {
            const { user, secret } = await enrolled();
            nextStep();
            const wrong = totp(secret) === '000000' ? '000001' : '000000';
            await signIn(user.email, { code: wrong });
            const rows = await ctx.db.select().from(auditLog).where(eq(auditLog.userId, user.id));
            expect(rows.map((r) => r.action)).toContain('mfa.failed');
        });
    });

    describe('recovery codes', () => {
        it('work once each', async () => {
            const { user, recoveryCodes } = await enrolled();
            const [one, two] = recoveryCodes;
            expect((await signIn(user.email, { recoveryCode: one })).statusCode).toBe(200);
            const again = await signIn(user.email, { recoveryCode: one });
            expect(again.statusCode).toBe(401);
            // another one still works, typed any way
            expect(
                (await signIn(user.email, { recoveryCode: ` ${two.toLowerCase().replace('-', ' ')} ` })).statusCode
            ).toBe(200);
            const status = await ctx.app.inject({
                url: '/auth/mfa',
                headers: await loginViaRecovery(user.email, recoveryCodes[2]),
            });
            expect(status.json().recoveryCodesLeft).toBe(7);
        });

        async function loginViaRecovery(email: string, recoveryCode: string) {
            const res = await signIn(email, { recoveryCode });
            const cookie = res.cookies.find((c) => c.name === 'qubdidb_session')!;
            return { cookie: `qubdidb_session=${cookie.value}` };
        }

        it('are recorded when used', async () => {
            const { user, recoveryCodes } = await enrolled();
            await signIn(user.email, { recoveryCode: recoveryCodes[0] });
            const rows = await ctx.db.select().from(auditLog).where(eq(auditLog.userId, user.id));
            expect(rows.map((r) => r.action)).toContain('mfa.recovery_used');
        });

        it('a made-up one is refused', async () => {
            const { user } = await enrolled();
            const res = await signIn(user.email, { recoveryCode: 'ZZZZZ-ZZZZZ' });
            expect(res.statusCode).toBe(401);
        });

        it('new ones need the password and a code, and replace the old', async () => {
            const { user, secret, recoveryCodes } = await enrolled();
            nextStep();
            const code = totp(secret);
            expect(
                (await post('/auth/mfa/recovery-codes', { password: 'nope-nope-nope-1', code }, user)).statusCode
            ).toBe(403);
            expect(
                (await post('/auth/mfa/recovery-codes', { password: PASSWORD, code: '000000' }, user)).statusCode
            ).toBe(403);
            const res = await post('/auth/mfa/recovery-codes', { password: PASSWORD, code }, user);
            expect(res.statusCode).toBe(200);
            const fresh: string[] = res.json().recoveryCodes;
            expect(fresh).toHaveLength(10);
            expect(fresh.some((c) => recoveryCodes.includes(c))).toBe(false);
            const old = await signIn(user.email, { recoveryCode: recoveryCodes[0] });
            expect(old.statusCode).toBe(401);
            const ok = await signIn(user.email, { recoveryCode: fresh[0] });
            expect(ok.statusCode).toBe(200);
        });
    });

    describe('turning it off', () => {
        it('needs the password and a code', async () => {
            const { user, secret } = await enrolled();
            nextStep();
            const code = totp(secret);
            const noPassword = await post('/auth/mfa/disable', { password: 'wrong-wrong-1234', code }, user);
            expect(noPassword.statusCode).toBe(403);
            expect(noPassword.json().error).toBe('wrong_password');
            const noCode = await post('/auth/mfa/disable', { password: PASSWORD, code: '000000' }, user);
            expect(noCode.statusCode).toBe(403);
            expect(noCode.json().error).toBe('invalid_code');
            expect((await ctx.app.inject({ url: '/auth/me', headers: as(user) })).json().mfaEnabled).toBe(true);
        });

        it('logs a wrong password as a password check, not as a failed sign-in', async () => {
            const { user, secret } = await enrolled();
            nextStep();
            const actions = async () => (await ctx.db.select().from(auditLog)).map((r) => r.action);
            const before = (await actions()).length;
            await post('/auth/mfa/disable', { password: 'wrong-wrong-1234', code: totp(secret) }, user);
            await post('/auth/mfa/recovery-codes', { password: 'wrong-wrong-1234', code: totp(secret) }, user);
            expect((await actions()).slice(before)).toEqual([
                'user.password_check_failed',
                'user.password_check_failed',
            ]);
        });

        it('with a code: back to the password alone, and nothing is left behind', async () => {
            const { user, secret } = await enrolled();
            nextStep();
            const res = await post('/auth/mfa/disable', { password: PASSWORD, code: totp(secret) }, user);
            expect(res.statusCode).toBe(200);
            expect((await password(user.email)).json().mfaRequired).toBeUndefined();
            const [row] = await ctx.db.select().from(users).where(eq(users.id, user.id));
            expect(row).toMatchObject({ mfaSecretEnc: null, mfaEnabledAt: null, mfaLastStep: null });
            const left = await ctx.db.select().from(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, user.id));
            expect(left).toHaveLength(0);
            const rows = await ctx.db.select().from(auditLog).where(eq(auditLog.userId, user.id));
            expect(rows.map((r) => r.action)).toContain('mfa.disable');
        });

        it('also with a recovery code', async () => {
            const { user, recoveryCodes } = await enrolled();
            const res = await post(
                '/auth/mfa/disable',
                { password: PASSWORD, recoveryCode: recoveryCodes[0] },
                user
            );
            expect(res.statusCode).toBe(200);
        });

        it('is refused when it is not on', async () => {
            const plain = await registerUser(ctx.app, `plain${++counter}@example.com`);
            const res = await post('/auth/mfa/disable', { password: PASSWORD, code: '123456' }, plain);
            expect(res.statusCode).toBe(409);
        });

        it('can be set up again afterwards', async () => {
            const { user, secret } = await enrolled();
            nextStep();
            await post('/auth/mfa/disable', { password: PASSWORD, code: totp(secret) }, user);
            const again = await post('/auth/mfa/setup', {}, user);
            expect(again.statusCode).toBe(200);
            expect(again.json().secret).not.toBe(secret);
        });
    });

    describe('changing the password', () => {
        const change = (user: TestUser, extra: object) =>
            post('/auth/change-password', { currentPassword: PASSWORD, newPassword: 'Another-Pass-456!', ...extra }, user);

        it('asks for a code again when it is on', async () => {
            const { user, secret } = await enrolled();
            const none = await change(user, {});
            expect(none.statusCode).toBe(403);
            expect(none.json().error).toBe('mfa_code_required');
            const wrong = await change(user, { code: '000000' });
            expect(wrong.statusCode).toBe(403);
            expect(wrong.json().error).toBe('invalid_code');
            nextStep();
            const ok = await change(user, { code: totp(secret) });
            expect(ok.statusCode).toBe(200);
        });

        it('does not ask when it is off', async () => {
            const plain = await registerUser(ctx.app, `plain${++counter}@example.com`);
            expect((await change(plain, {})).statusCode).toBe(200);
        });
    });

    describe('limits', () => {
        it('the second step is limited per client address', async () => {
            const tight = await createTestApp(
                { secretsKey: KEY, authRateLimit: 3 },
                undefined,
                false
            );
            try {
                const codes: number[] = [];
                for (let i = 0; i < 5; i++) {
                    const res = await tight.app.inject({
                        method: 'POST',
                        url: '/auth/login/mfa',
                        payload: { challenge: 'x', code: '123456' },
                    });
                    codes.push(res.statusCode);
                }
                expect(codes).toEqual([401, 401, 401, 429, 429]);
            } finally {
                await tight.close();
            }
        });

        it('wrong codes over several tickets lock the account', async () => {
            const strict = await createTestApp(
                { secretsKey: KEY, authMaxFailures: 4 },
                undefined,
                false
            );
            try {
                const { user, secret } = await enrolledOn(strict);
                const wrong = totp(secret) === '000000' ? '000001' : '000000';
                const statuses: number[] = [];
                for (let i = 0; i < 5; i++) {
                    const first = await strict.app.inject({
                        method: 'POST',
                        url: '/auth/login',
                        payload: { email: user.email, password: PASSWORD },
                    });
                    const res = await strict.app.inject({
                        method: 'POST',
                        url: '/auth/login/mfa',
                        payload: { challenge: first.json().challenge, code: wrong },
                    });
                    statuses.push(res.statusCode);
                }
                expect(statuses).toEqual([401, 401, 401, 401, 429]);
                const locked = await strict.app.inject({
                    method: 'POST',
                    url: '/auth/login/mfa',
                    payload: { challenge: 'x', code: wrong },
                });
                expect(locked.statusCode).toBe(401);
            } finally {
                await strict.close();
            }
        });

        async function enrolledOn(app: TestCtx) {
            const email = `limit${++counter}@example.com`;
            // the admin of the shared database creates the account
            const admin = await loginUser(app.app, 'admin@example.com');
            const created = await app.app.inject({
                method: 'POST',
                url: '/admin/users',
                headers: as(admin),
                payload: { email, password: PASSWORD },
            });
            expect(created.statusCode).toBe(201);
            await ctx.db.update(users).set({ mustChangePassword: false }).where(eq(users.email, email));
            const user = await loginUser(app.app, email);
            const { secret } = (
                await app.app.inject({ method: 'POST', url: '/auth/mfa/setup', payload: {}, headers: as(user) })
            ).json();
            const enable = await app.app.inject({
                method: 'POST',
                url: '/auth/mfa/enable',
                payload: { code: totp(secret) },
                headers: as(user),
            });
            expect(enable.statusCode).toBe(200);
            return { user, secret };
        }
    });
});
