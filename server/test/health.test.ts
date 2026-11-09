import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { Db } from '../src/db/client.js';
import { createTestApp, TEST_URL, type TestCtx } from './helpers.js';

describe('GET /health', () => {
    let ctx: TestCtx;
    beforeAll(async () => {
        ctx = await createTestApp();
    });
    afterAll(() => ctx.close());

    it('answers ok when the database does', async () => {
        const res = await ctx.app.inject({ url: '/health' });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ok: true });
    });

    const withDb = (execute: () => Promise<unknown>) =>
        buildApp({
            config: loadConfig({ DATABASE_URL: TEST_URL, LOG_LEVEL: 'silent' }),
            db: { execute } as unknown as Db,
        });

    it('answers 503 when the database fails', async () => {
        const app = withDb(() => Promise.reject(new Error('connection refused')));
        const res = await app.inject({ url: '/health' });
        expect(res.statusCode).toBe(503);
        expect(res.json()).toEqual({ ok: false });
        await app.close();
    });

    it('answers 503 when the database does not answer in time', async () => {
        const app = withDb(() => new Promise(() => undefined));
        const started = Date.now();
        const res = await app.inject({ url: '/health' });
        expect(res.statusCode).toBe(503);
        expect(Date.now() - started).toBeLessThan(4000);
        await app.close();
    });
});
