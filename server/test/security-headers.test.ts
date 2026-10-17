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
            payload: { email: 'a@example.com', password: 'password123' },
        });
        expect(res.statusCode).toBe(200);
        expectHeaders(res.headers);
    });
});
