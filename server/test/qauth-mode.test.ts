import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../src/config.js';
import {
    QauthError,
    type QauthClient,
    type QauthLogin,
    type QauthPerson,
    type QauthTokens,
} from '../src/auth/qauth.js';
import { sessions, users } from '../src/db/schema.js';
import { createTestApp, TEST_URL, type TestCtx } from './helpers.js';

// QBase with AUTH_PROVIDER=qauth: QAuth knows the people, QBase keeps its own
// roles and opens its own session once QAuth has vouched for the person.

interface Person {
    id: string;
    email: string;
    password: string;
    verified: boolean;
    mfaCode?: string;
}

/** A stand-in for QAuth's REST API, as far as QBase uses it. */
class FakeQauth implements QauthClient {
    people = new Map<string, Person>();
    /** refresh token -> who it belongs to; a missing entry is a sign-in that ended */
    refreshTokens = new Map<string, string>();
    access = new Map<string, string>();
    tickets = new Map<string, Person>();
    down = false;
    locked = false;
    loggedOut: string[] = [];
    seenIps: string[] = [];
    private n = 0;

    add(email: string, password = 'Pw-from-QAuth-1!', extra: Partial<Person> = {}): Person {
        const p: Person = { id: `sub-${++this.n}`, email, password, verified: true, ...extra };
        this.people.set(email, p);
        return p;
    }

    private tokensFor(p: Person): QauthTokens {
        const accessToken = `at-${++this.n}`;
        const refreshToken = `rt-${++this.n}`;
        this.access.set(accessToken, p.email);
        this.refreshTokens.set(refreshToken, p.email);
        return { accessToken, refreshToken, mustChangePassword: false, mfaEnrollmentRequired: false };
    }

    private check() {
        if (this.down) throw new QauthError(0, 'unreachable');
    }

    async login(email: string, password: string, ip: string): Promise<QauthLogin> {
        this.check();
        this.seenIps.push(ip);
        if (this.locked) throw new QauthError(429, 'too_many_attempts', 30);
        const p = this.people.get(email);
        if (!p || p.password !== password) throw new QauthError(401, 'invalid_credentials');
        if (p.mfaCode) {
            const ticket = `ticket-${++this.n}`;
            this.tickets.set(ticket, p);
            return { kind: 'mfa', ticket };
        }
        return { kind: 'ok', tokens: this.tokensFor(p) };
    }

    async verifyMfa(ticket: string, code: string): Promise<QauthTokens> {
        this.check();
        const p = this.tickets.get(ticket);
        if (!p) throw new QauthError(401, 'invalid_ticket');
        if (code !== p.mfaCode) throw new QauthError(401, 'invalid_code');
        this.tickets.delete(ticket);
        return this.tokensFor(p);
    }

    async refresh(refreshToken: string): Promise<QauthTokens> {
        this.check();
        const email = this.refreshTokens.get(refreshToken);
        if (!email) throw new QauthError(401, 'invalid_token');
        this.refreshTokens.delete(refreshToken);
        return this.tokensFor(this.people.get(email)!);
    }

    async me(accessToken: string): Promise<QauthPerson & { emailVerified: boolean }> {
        this.check();
        const p = this.people.get(this.access.get(accessToken) ?? '');
        if (!p) throw new QauthError(401, 'invalid_token');
        return { id: p.id, email: p.email, displayName: '', emailVerified: p.verified };
    }

    async logout(accessToken: string): Promise<void> {
        this.check();
        this.loggedOut.push(accessToken);
        const email = this.access.get(accessToken);
        for (const [rt, e] of this.refreshTokens) if (e === email) this.refreshTokens.delete(rt);
    }

    async changePassword(accessToken: string, current: string, next: string): Promise<void> {
        const p = this.people.get(this.access.get(accessToken) ?? '');
        if (!p) throw new QauthError(401, 'invalid_token');
        if (p.password !== current) throw new QauthError(401, 'invalid_credentials');
        if (next.length < 12) throw new QauthError(422, 'weak_password', undefined, { rules: ['min_length'] });
        p.password = next;
    }

    async stepUp(accessToken: string, password: string, code: string | undefined): Promise<void> {
        this.check();
        const p = this.people.get(this.access.get(accessToken) ?? '');
        if (!p) throw new QauthError(401, 'invalid_token');
        if (p.password !== password) throw new QauthError(401, 'invalid_credentials');
        if (p.mfaCode && !code) throw new QauthError(403, 'mfa_code_required');
        if (p.mfaCode && code !== p.mfaCode) throw new QauthError(403, 'invalid_code');
    }

    /** the person signs out at QAuth (or QAuth ends their sign-ins): every refresh token dies */
    endSignIns(email: string) {
        for (const [rt, e] of this.refreshTokens) if (e === email) this.refreshTokens.delete(rt);
    }
}

const QAUTH_ENV = {
    AUTH_PROVIDER: 'qauth',
    QAUTH_URL: 'https://qauth.example.com',
    QAUTH_CLIENT_ID: 'c_qbase',
    SECRETS_KEY: 'k'.repeat(32),
};

describe('AUTH_PROVIDER=qauth', () => {
    let ctx: TestCtx;
    let qauth: FakeQauth;

    beforeAll(async () => {
        qauth = new FakeQauth();
        ctx = await createTestApp(
            loadConfig({ DATABASE_URL: TEST_URL, LOG_LEVEL: 'silent', ...QAUTH_ENV }),
            undefined,
            true,
            100_000,
            qauth
        );
    });
    afterAll(() => ctx.close());
    beforeEach(() => {
        qauth.down = false;
        qauth.locked = false;
    });

    const signIn = async (email: string, password = 'Pw-from-QAuth-1!') => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email, password },
            remoteAddress: '203.0.113.7',
        });
        const set = res.cookies.find((c) => c.name === 'qbase_session');
        return { res, cookie: set ? `qbase_session=${set.value}` : '' };
    };
    const me = (cookie: string) =>
        ctx.app.inject({ url: '/auth/me', headers: { cookie } });

    it('refuses to start without what it needs', () => {
        expect(() => loadConfig({ DATABASE_URL: TEST_URL, AUTH_PROVIDER: 'qauth' })).toThrow(
            /QAUTH_URL.*QAUTH_CLIENT_ID.*SECRETS_KEY/s
        );
        expect(() => loadConfig({ DATABASE_URL: TEST_URL, AUTH_PROVIDER: 'ldap' })).toThrow(/AUTH_PROVIDER/);
        expect(loadConfig({ DATABASE_URL: TEST_URL }).authProvider).toBe('local');
    });

    it('has no setup form, no sign-up and no two-factor of its own', async () => {
        const status = await ctx.app.inject({ url: '/auth/setup-status' });
        expect(status.json()).toMatchObject({ needsSetup: false, mfaAvailable: false, authProvider: 'qauth' });
        const signup = await ctx.app.inject({
            method: 'POST',
            url: '/auth/register',
            payload: { email: 'x@example.com', password: 'Whatever-123!' },
        });
        expect(signup.statusCode).toBe(403);
        const mfa = await ctx.app.inject({ url: '/auth/mfa' });
        expect(mfa.statusCode).toBe(404);
    });

    it('signs a person in through QAuth; the first one becomes the admin, the next ones do not', async () => {
        qauth.add('ann@example.com');
        qauth.add('bob@example.com');
        const ann = await signIn('ann@example.com');
        expect(ann.res.statusCode).toBe(200);
        expect(ann.res.json()).toMatchObject({ email: 'ann@example.com', isAdmin: true, mfaEnabled: false });
        const bob = await signIn('bob@example.com');
        expect(bob.res.json().isAdmin).toBe(false);
        expect((await me(ann.cookie)).json().email).toBe('ann@example.com');
        // QBase keeps the account, not the password
        const [row] = await ctx.db.select().from(users).where(eq(users.email, 'ann@example.com'));
        expect(row.passwordHash).toBeNull();
        expect(row.qauthSub).toBe(qauth.people.get('ann@example.com')!.id);
        // the same person again is the same account
        await signIn('ann@example.com');
        expect((await ctx.db.select().from(users).where(eq(users.email, 'ann@example.com'))).length).toBe(1);
        // QAuth is told which address the browser came from, for its own limits
        expect(qauth.seenIps).toContain('203.0.113.7');
    });

    it('answers a wrong password, a lockout and a QAuth that is down the way the screens expect', async () => {
        expect((await signIn('ann@example.com', 'wrong')).res.statusCode).toBe(401);
        expect((await signIn('ann@example.com', 'wrong')).res.json()).toEqual({ error: 'invalid_credentials' });
        qauth.locked = true;
        const locked = await signIn('ann@example.com');
        expect(locked.res.statusCode).toBe(429);
        expect(locked.res.headers['retry-after']).toBe('30');
        qauth.locked = false;
        qauth.down = true;
        expect((await signIn('ann@example.com')).res.statusCode).toBe(503);
    });

    it('does the second step at QAuth', async () => {
        qauth.add('mia@example.com', 'Pw-from-QAuth-1!', { mfaCode: '123456' });
        const first = await signIn('mia@example.com');
        expect(first.res.json()).toMatchObject({ mfaRequired: true });
        expect(first.cookie).toBe('');
        const challenge = first.res.json().challenge;
        const bad = await ctx.app.inject({ method: 'POST', url: '/auth/login/mfa', payload: { challenge, code: '000000' } });
        expect(bad.statusCode).toBe(401);
        expect(bad.json()).toEqual({ error: 'invalid_code' });
        const good = await ctx.app.inject({ method: 'POST', url: '/auth/login/mfa', payload: { challenge, code: '123456' } });
        expect(good.statusCode).toBe(200);
        expect(good.json().email).toBe('mia@example.com');
        expect(good.cookies.some((c) => c.name === 'qbase_session')).toBe(true);
    });

    it('links a local account with the same address once QAuth has verified it, and not before', async () => {
        const local = await ctx.db
            .insert(users)
            .values({ email: 'old@example.com', passwordHash: 'x', isAdmin: false })
            .returning();
        qauth.add('old@example.com', 'Pw-from-QAuth-1!', { verified: false });
        const refused = await signIn('old@example.com');
        expect(refused.res.statusCode).toBe(403);
        expect(refused.res.json()).toEqual({ error: 'account_exists' });
        expect(qauth.loggedOut.length).toBeGreaterThan(0); // the QAuth sign-in made for it is ended
        qauth.people.get('old@example.com')!.verified = true;
        const ok = await signIn('old@example.com');
        expect(ok.res.statusCode).toBe(200);
        expect(ok.res.json().id).toBe(local[0].id); // the same account: its projects and diagrams carry over
    });

    it('keeps a disabled account out, like a wrong password', async () => {
        qauth.add('dis@example.com');
        await signIn('dis@example.com');
        await ctx.db.update(users).set({ isActive: false }).where(eq(users.email, 'dis@example.com'));
        const res = await signIn('dis@example.com');
        expect(res.res.statusCode).toBe(401);
        expect(res.res.json()).toEqual({ error: 'invalid_credentials' });
    });

    it('asks QAuth now and then, and ends the session when QAuth says the person is not signed in there', async () => {
        qauth.add('liv@example.com');
        const { cookie } = await signIn('liv@example.com');
        const [liv] = await ctx.db.select().from(users).where(eq(users.email, 'liv@example.com'));
        const sessionOf = async () =>
            (await ctx.db.select().from(sessions).where(eq(sessions.userId, liv.id)))[0];
        const before = await sessionOf();
        expect((await me(cookie)).statusCode).toBe(200); // not due yet: QAuth is not asked
        const age = () =>
            ctx.db
                .update(sessions)
                .set({ idpCheckedAt: new Date(Date.now() - 10 * 60_000) })
                .where(eq(sessions.userId, liv.id));
        // due, but QAuth cannot be reached: the session stays usable
        await age();
        qauth.down = true;
        expect((await me(cookie)).statusCode).toBe(200);
        qauth.down = false;
        // due and QAuth answers: the refresh token is replaced
        await age();
        expect((await me(cookie)).statusCode).toBe(200);
        expect((await sessionOf()).idpRefreshEnc).not.toBe(before.idpRefreshEnc);
        // the person signs out at QAuth (or changes their password there, or is disabled)
        qauth.endSignIns('liv@example.com');
        await age();
        expect((await me(cookie)).statusCode).toBe(401);
        expect(await sessionOf()).toBeUndefined();
    });

    it('signs out at QAuth too', async () => {
        qauth.add('out@example.com');
        const { cookie } = await signIn('out@example.com');
        const res = await ctx.app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } });
        expect(res.statusCode).toBe(200);
        expect(qauth.loggedOut.length).toBeGreaterThan(0);
        expect((await me(cookie)).statusCode).toBe(401);
        expect(qauth.refreshTokens.size).toBe(
            [...qauth.refreshTokens.values()].filter((e) => e !== 'out@example.com').length
        );
    });

    it('changes the password at QAuth', async () => {
        qauth.add('pw@example.com');
        const { cookie } = await signIn('pw@example.com');
        const change = (currentPassword: string, newPassword: string) =>
            ctx.app.inject({
                method: 'POST',
                url: '/auth/change-password',
                headers: { cookie },
                payload: { currentPassword, newPassword },
            });
        expect((await change('wrong', 'A-new-long-password-1!')).statusCode).toBe(403);
        const weak = await change('Pw-from-QAuth-1!', 'short');
        expect(weak.statusCode).toBe(400);
        expect(weak.json().error).toBe('weak_password');
        expect((await change('Pw-from-QAuth-1!', 'A-new-long-password-1!')).statusCode).toBe(200);
        expect(qauth.people.get('pw@example.com')!.password).toBe('A-new-long-password-1!');
    });

    it('leaves accounts to QAuth: no creating people or resetting passwords here', async () => {
        const admin = await signIn('ann@example.com');
        const create = await ctx.app.inject({
            method: 'POST',
            url: '/admin/users',
            headers: { cookie: admin.cookie },
            payload: { email: 'new@example.com', password: 'Whatever-123!' },
        });
        expect(create.statusCode).toBe(409);
        expect(create.json()).toEqual({ error: 'managed_by_qauth' });
        const [bob] = await ctx.db.select().from(users).where(eq(users.email, 'bob@example.com'));
        const reset = await ctx.app.inject({
            method: 'PATCH',
            url: `/admin/users/${bob.id}`,
            headers: { cookie: admin.cookie },
            payload: { password: 'Another-long-pass-1!' },
        });
        expect(reset.statusCode).toBe(409);
    });

    it('asks QAuth to confirm the admin before making another admin', async () => {
        const admin = await signIn('ann@example.com');
        const [bob] = await ctx.db.select().from(users).where(eq(users.email, 'bob@example.com'));
        const promote = (payload: Record<string, unknown>) =>
            ctx.app.inject({
                method: 'PATCH',
                url: `/admin/users/${bob.id}`,
                headers: { cookie: admin.cookie },
                payload: { isAdmin: true, ...payload },
            });
        expect((await promote({})).json()).toEqual({ error: 'step_up_required' });
        expect((await promote({ adminPassword: 'wrong' })).json()).toEqual({ error: 'wrong_password' });
        const ok = await promote({ adminPassword: 'Pw-from-QAuth-1!' });
        expect(ok.statusCode).toBe(200);
        // QBase's own roles: bob is an admin of QBase now, whatever QAuth thinks
        const [after] = await ctx.db.select().from(users).where(eq(users.id, bob.id));
        expect(after.isAdmin).toBe(true);
    });
});
