import { afterAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers.js';

const ORIGIN = 'https://editor.example.com';

describe('CORS', () => {
    const open: TestCtx[] = [];
    const appWith = async (corsOrigin: string | null) => {
        const ctx = await createTestApp({ corsOrigin });
        open.push(ctx);
        return ctx.app;
    };
    afterAll(async () => {
        for (const ctx of open) await ctx.close();
    });

    it('answers a preflight with 204 and the allowed methods, headers and origin', async () => {
        const app = await appWith(ORIGIN);
        const res = await app.inject({
            method: 'OPTIONS',
            url: '/diagrams',
            headers: { origin: ORIGIN, 'access-control-request-method': 'PUT' },
        });
        expect(res.statusCode).toBe(204);
        expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
        expect(res.headers['access-control-allow-credentials']).toBe('true');
        expect(res.headers['access-control-allow-methods']).toBe('GET,POST,PUT,PATCH,DELETE,OPTIONS');
        expect(res.headers['access-control-allow-headers']).toBe('content-type');
        expect(res.body).toBe('');
    });

    it('allows exactly the configured origin, never a wildcard, and varies on origin', async () => {
        const app = await appWith(ORIGIN);
        for (const origin of [ORIGIN, 'https://evil.example.com']) {
            const res = await app.inject({ url: '/health', headers: { origin } });
            expect(res.statusCode).toBe(200);
            // the header names the one configured site whoever asks, so a browser
            // on any other site is refused by the browser itself
            expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
            expect(res.headers['access-control-allow-origin']).not.toBe('*');
            expect(res.headers['access-control-allow-credentials']).toBe('true');
            expect(res.headers.vary).toContain('origin');
        }
    });

    it('lets the editor read the export headers', async () => {
        const app = await appWith(ORIGIN);
        const res = await app.inject({ url: '/health', headers: { origin: ORIGIN } });
        expect(res.headers['access-control-expose-headers']).toBe('x-row-count,x-truncated,content-disposition');
    });

    it('sends no CORS headers when no origin is configured, and does not answer preflights', async () => {
        const app = await appWith(null);
        const res = await app.inject({ url: '/health', headers: { origin: ORIGIN } });
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
        expect(res.headers['access-control-allow-credentials']).toBeUndefined();
        const preflight = await app.inject({ method: 'OPTIONS', url: '/diagrams', headers: { origin: ORIGIN } });
        expect(preflight.statusCode).not.toBe(204);
    });
});

describe('Origin check on changing requests', () => {
    const open: TestCtx[] = [];
    const appWith = async (corsOrigin: string | null) => {
        const ctx = await createTestApp({ corsOrigin });
        open.push(ctx);
        return ctx.app;
    };
    afterAll(async () => {
        for (const ctx of open) await ctx.close();
    });
    const login = (app: Awaited<ReturnType<typeof appWith>>, headers: Record<string, string>, method = 'POST') =>
        app.inject({ method: method as 'POST', url: '/auth/login', headers, payload: { email: 'a@example.com', password: 'nope-nope-nope' } });

    it('refuses a changing request from another site and lets the editor and scripts through', async () => {
        const app = await appWith(ORIGIN);
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
            const res = await app.inject({ method: method as 'POST', url: '/auth/login', headers: { origin: 'https://evil.example.com' } });
            expect(res.statusCode, method).toBe(403);
            expect(res.json().error).toBe('bad_origin');
        }
        expect((await login(app, { origin: 'null' })).statusCode).toBe(403);
        // the editor, and a client that sends no Origin at all, reach the route (bad credentials: 401)
        expect((await login(app, { origin: ORIGIN })).statusCode).toBe(401);
        expect((await login(app, {})).statusCode).toBe(401);
    });

    it('does not look at reads, even from another site', async () => {
        const app = await appWith(ORIGIN);
        const res = await app.inject({ url: '/health', headers: { origin: 'https://evil.example.com' } });
        expect(res.statusCode).toBe(200);
    });

    it('with no CORS origin set, only the same host may change things', async () => {
        const app = await appWith(null);
        expect((await login(app, { host: 'api.example.com', origin: 'https://evil.example.com' })).statusCode).toBe(403);
        expect((await login(app, { host: 'api.example.com', origin: 'https://api.example.com' })).statusCode).toBe(401);
        expect((await login(app, { host: 'api.example.com' })).statusCode).toBe(401);
    });
});
