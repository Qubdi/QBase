import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, mfaRecoveryCodes, sessions, users } from '../src/db/schema.js';
import { totp } from '../src/auth/totp.js';
import { main, resetMfaByEmail } from '../src/cli/mfa-reset.js';
import {
    as,
    createTestApp,
    loginUser,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

const KEY = 'a-test-key-of-at-least-16-chars';

describe('admin and command-line reset of two-factor sign-in', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let member: TestUser;
    let plain: TestUser;

    const call = (method: 'GET' | 'POST', url: string, who?: TestUser) =>
        ctx.app.inject({ method, url, headers: who ? as(who) : undefined });

    /** Switches two-factor on for the member through the API, like a person would. */
    async function turnOn(user: TestUser) {
        const setup = await ctx.app.inject({
            method: 'POST',
            url: '/auth/mfa/setup',
            payload: {},
            headers: as(user),
        });
        const enable = await ctx.app.inject({
            method: 'POST',
            url: '/auth/mfa/enable',
            payload: { code: totp(setup.json().secret) },
            headers: as(user),
        });
        expect(enable.statusCode).toBe(200);
    }

    beforeAll(async () => {
        ctx = await createTestApp({ secretsKey: KEY });
        admin = await registerUser(ctx.app, 'admin@example.com');
        member = await registerUser(ctx.app, 'member@example.com');
        plain = await registerUser(ctx.app, 'plain@example.com');
        await turnOn(member);
    });
    afterAll(() => ctx.close());

    it('the Users list says who has it on', async () => {
        const res = await call('GET', '/admin/users', admin);
        const byEmail = new Map(
            (res.json().items as { email: string; mfaEnabled: boolean }[]).map((u) => [u.email, u.mfaEnabled])
        );
        expect(byEmail.get('member@example.com')).toBe(true);
        expect(byEmail.get('plain@example.com')).toBe(false);
        expect(byEmail.get('admin@example.com')).toBe(false);
    });

    describe('POST /admin/users/:id/mfa/reset', () => {
        it('is for admins only', async () => {
            const res = await call('POST', `/admin/users/${member.id}/mfa/reset`, plain);
            // under /admin everyone but an admin gets a 404
            expect(res.statusCode).toBe(404);
            expect((await call('POST', `/admin/users/${member.id}/mfa/reset`)).statusCode).toBe(401);
        });

        it('refuses yourself and an unknown account', async () => {
            expect((await call('POST', `/admin/users/${admin.id}/mfa/reset`, admin)).statusCode).toBe(400);
            const res = await call('POST', '/admin/users/00000000-0000-4000-8000-000000000000/mfa/reset', admin);
            expect(res.statusCode).toBe(404);
        });

        it('says nothing happened for an account that does not have it', async () => {
            const res = await call('POST', `/admin/users/${plain.id}/mfa/reset`, admin);
            expect(res.json()).toEqual({ reset: false });
            const rows = await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'mfa.reset'));
            expect(rows).toHaveLength(0);
        });

        it('clears the secret and the codes, signs them out, and is recorded', async () => {
            expect((await call('GET', '/auth/me', member)).statusCode).toBe(200);
            const res = await call('POST', `/admin/users/${member.id}/mfa/reset`, admin);
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ reset: true });

            const [row] = await ctx.db.select().from(users).where(eq(users.id, member.id));
            expect(row).toMatchObject({ mfaSecretEnc: null, mfaEnabledAt: null, mfaLastStep: null });
            expect(await ctx.db.select().from(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, member.id))).toHaveLength(0);
            expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, member.id))).toHaveLength(0);
            expect((await call('GET', '/auth/me', member)).statusCode).toBe(401);

            const [logged] = await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'mfa.reset'));
            expect(logged.userId).toBe(admin.id);
            expect(logged.meta).toEqual({ targetUserId: member.id });

            // back to the password alone
            const again = await loginUser(ctx.app, 'member@example.com');
            expect(again.id).toBe(member.id);
        });

        it('does not exist when MFA_ENABLED=false', async () => {
            const off = await createTestApp({ secretsKey: KEY, mfaEnabled: false }, undefined, false);
            try {
                const me = await loginUser(off.app, 'admin@example.com');
                const res = await off.app.inject({
                    method: 'POST',
                    url: `/admin/users/${plain.id}/mfa/reset`,
                    headers: as(me),
                });
                expect(res.statusCode).toBe(404);
            } finally {
                await off.close();
            }
        });
    });

    describe('npm run mfa:reset', () => {
        it('switches it off for the account and signs it out', async () => {
            // the earlier reset ended the member's session: sign in again
            member = await loginUser(ctx.app, 'member@example.com');
            await turnOn(member);
            expect(await resetMfaByEmail(ctx.db, 'Member@Example.com')).toBe('reset');
            const [row] = await ctx.db.select().from(users).where(eq(users.id, member.id));
            expect(row.mfaEnabledAt).toBeNull();
            expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, member.id))).toHaveLength(0);
            const logged = await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'mfa.reset'));
            expect(logged.some((r) => r.userId === member.id && r.meta?.targetUserId === member.id)).toBe(true);
        });

        it('says so when there is nothing to reset or no such account', async () => {
            expect(await resetMfaByEmail(ctx.db, 'plain@example.com')).toBe('not_enabled');
            expect(await resetMfaByEmail(ctx.db, 'nobody@example.com')).toBe('no_such_user');
        });

        it('wants exactly one email', async () => {
            expect(await main([])).toBe(2);
            expect(await main(['a@example.com', 'b@example.com'])).toBe(2);
            expect(await main(['--help'])).toBe(2);
        });
    });
});
