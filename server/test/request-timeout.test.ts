import { describe, expect, it } from 'vitest';
import { CONNECTION_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from '../src/app.js';
import { createTestApp } from './helpers.js';

describe('slow-request timeouts', () => {
    it('sets a request and a connection timeout on the HTTP server', async () => {
        const ctx = await createTestApp();
        try {
            expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
            expect(CONNECTION_TIMEOUT_MS).toBeGreaterThan(0);
            expect(ctx.app.initialConfig.connectionTimeout).toBe(CONNECTION_TIMEOUT_MS);
            expect(ctx.app.server.requestTimeout).toBe(REQUEST_TIMEOUT_MS);
            expect(ctx.app.server.timeout).toBe(CONNECTION_TIMEOUT_MS);
        } finally {
            await ctx.close();
        }
    });
});
