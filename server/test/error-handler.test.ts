import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/client.js';
import { TEST_URL } from './helpers.js';

describe('error handler', () => {
    const { db, pool } = createDb(TEST_URL);
    const app = buildApp({
        config: { ...loadConfig({ DATABASE_URL: TEST_URL, LOG_LEVEL: 'silent' }), databaseUrl: TEST_URL },
        db,
    });
    const fail = (status: number, message: string) =>
        app.get(`/fail-${status}`, async () => {
            throw Object.assign(new Error(message), { statusCode: status });
        });

    beforeAll(async () => {
        for (const status of [400, 404, 500, 502, 503]) {
            fail(status, `detail for ${status}: host=db.internal password=hunter2`);
        }
        await app.ready();
    });
    afterAll(async () => {
        await app.close();
        await pool.end();
    });

    it('keeps the message for client errors', async () => {
        for (const status of [400, 404]) {
            const res = await app.inject({ url: `/fail-${status}` });
            expect(res.statusCode).toBe(status);
            expect(res.json().error).toContain(`detail for ${status}`);
        }
    });

    it('hides the message for every server error, not only 500', async () => {
        for (const status of [500, 502, 503]) {
            const res = await app.inject({ url: `/fail-${status}` });
            expect(res.statusCode).toBe(status);
            expect(res.json()).toEqual({ error: 'internal_error' });
            expect(res.body).not.toContain('hunter2');
        }
    });
});
