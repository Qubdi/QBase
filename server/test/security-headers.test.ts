import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestCtx } from './helpers.js';

describe('security headers', () => {
    let ctx: TestCtx;
    beforeAll(async () => {
        ctx = await createTestApp();
    });
    afterAll(() => ctx.close());

    const expectHeaders = (headers: Record<string, unknown>) => {
        expect(headers['x-content-type-options']).toBe('nosniff');
        expect(headers['x-frame-options']).toBe('DENY');
        expect(headers['referrer-policy']).toBe('no-referrer');
        expect(headers['content-security-policy']).toBe(
            "default-src 'none'; frame-ancestors 'none'"
        );
    };

    it('sets them on a normal response', async () => {
        const res = await ctx.app.inject({ url: '/auth/setup-status' });
        expect(res.statusCode).toBe(200);
        expectHeaders(res.headers);
    });

    it('sets them on errors too', async () => {
        const unauthorized = await ctx.app.inject({ url: '/diagrams' });
        expect(unauthorized.statusCode).toBe(401);
        expectHeaders(unauthorized.headers);
        const missing = await ctx.app.inject({ url: '/no-such-route' });
        expect(missing.statusCode).toBe(404);
        expectHeaders(missing.headers);
    });

    it('sets them on a response that carries a session', async () => {
        await registerUser(ctx.app, 'a@example.com');
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: 'a@example.com', password: 'Password-123!' },
        });
        expect(res.statusCode).toBe(200);
        expectHeaders(res.headers);
    });
});

describe('HSTS and caching', () => {
    let ctx: TestCtx;
    beforeAll(async () => {
        ctx = await createTestApp({ trustProxy: true });
    });
    afterAll(() => ctx.close());

    it('sends Strict-Transport-Security over https only', async () => {
        const https = await ctx.app.inject({
            url: '/auth/setup-status',
            headers: { 'x-forwarded-proto': 'https' },
        });
        expect(https.headers['strict-transport-security']).toBe(
            'max-age=63072000; includeSubDomains'
        );
        const http = await ctx.app.inject({ url: '/auth/setup-status' });
        expect(http.headers['strict-transport-security']).toBeUndefined();
    });

    it('sends it whenever the cookie is forced secure', async () => {
        const secure = await createTestApp({ cookieSecure: true });
        try {
            const res = await secure.app.inject({ url: '/auth/setup-status' });
            expect(res.headers['strict-transport-security']).toBeDefined();
        } finally {
            await secure.close();
        }
    });

    it('tells caches to keep no copy of an API answer', async () => {
        const ok = await ctx.app.inject({ url: '/auth/setup-status' });
        expect(ok.headers['cache-control']).toBe('no-store');
        const err = await ctx.app.inject({ url: '/diagrams' });
        expect(err.headers['cache-control']).toBe('no-store');
    });
});
