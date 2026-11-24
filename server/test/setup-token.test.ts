import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const hashed = vi.hoisted(() => ({ count: 0 }));
vi.mock('../src/auth/password.js', async (importOriginal) => {
    const real = await importOriginal<typeof import('../src/auth/password.js')>();
    return {
        ...real,
        hashPassword: (password: string) => {
            hashed.count++;
            return real.hashPassword(password);
        },
    };
});

const { createTestApp } = await import('./helpers.js');
type TestCtx = Awaited<ReturnType<typeof createTestApp>>;

const TOKEN = 'a-setup-token-of-some-length';
const account = { email: 'admin@example.com', password: 'Password-123!-long' };

describe('first-run sign-up with a setup token', () => {
    let ctx: TestCtx;
    beforeAll(async () => {
        ctx = await createTestApp({ setupToken: TOKEN });
    });
    afterAll(() => ctx.close());

    const status = async () =>
        (await ctx.app.inject({ url: '/auth/setup-status' })).json();
    const register = (extra: Record<string, unknown> = {}) =>
        ctx.app.inject({
            method: 'POST',
            url: '/auth/register',
            payload: { ...account, ...extra },
        });

    it('tells the form a token is needed, without telling it the token', async () => {
        const body = await status();
        expect(body).toMatchObject({ needsSetup: true, setupTokenRequired: true });
        expect(JSON.stringify(body)).not.toContain(TOKEN);
    });

    it('refuses a sign-up with no token, a wrong one or a near one, before hashing', async () => {
        const before = hashed.count;
        for (const extra of [{}, { setupToken: 'wrong' }, { setupToken: TOKEN + 'x' }, { setupToken: TOKEN.slice(1) }]) {
            const res = await register(extra);
            expect(res.statusCode).toBe(403);
            expect(res.json().error).toBe('invalid_setup_token');
        }
        expect(hashed.count).toBe(before);
        expect((await status()).needsSetup).toBe(true);
    });

    it('creates the admin with the right token, then closes sign-up and stops asking', async () => {
        const res = await register({ setupToken: TOKEN });
        expect(res.statusCode).toBe(201);
        expect(res.json().isAdmin).toBe(true);
        expect(await status()).toMatchObject({ needsSetup: false, setupTokenRequired: false });
        // once an account exists the answer is the same with or without the token
        const late = await register({ email: 'late@example.com' });
        expect(late.statusCode).toBe(403);
        expect(late.json().error).toBe('signup_disabled');
    });
});

describe('first-run sign-up with no setup token configured', () => {
    let ctx: TestCtx;
    beforeAll(async () => {
        ctx = await createTestApp({ setupToken: null, allowOpenBootstrap: false });
    });
    afterAll(() => ctx.close());

    it('refuses, before hashing, and tells the form it cannot succeed yet', async () => {
        const before = hashed.count;
        const body = (await ctx.app.inject({ url: '/auth/setup-status' })).json();
        expect(body).toMatchObject({
            needsSetup: true,
            setupTokenRequired: true,
            setupTokenConfigured: false,
        });
        const res = await ctx.app.inject({ method: 'POST', url: '/auth/register', payload: account });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe('setup_token_required');
        expect(hashed.count).toBe(before);
    });
});

describe('first-run sign-up with ALLOW_OPEN_BOOTSTRAP', () => {
    let ctx: TestCtx;
    beforeAll(async () => {
        ctx = await createTestApp({ setupToken: null, allowOpenBootstrap: true });
    });
    afterAll(() => ctx.close());

    it('lets the first caller become admin with no token', async () => {
        const body = (await ctx.app.inject({ url: '/auth/setup-status' })).json();
        expect(body).toMatchObject({ needsSetup: true, setupTokenRequired: false });
        const res = await ctx.app.inject({ method: 'POST', url: '/auth/register', payload: account });
        expect(res.statusCode).toBe(201);
    });
});
