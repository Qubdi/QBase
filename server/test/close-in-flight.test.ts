import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { as, createDiagram, createTestApp, registerUser } from './helpers.js';

describe('closing the app', () => {
    it('lets a request that is being received finish, instead of cutting it off', async () => {
        const ctx = await createTestApp();
        try {
            await ctx.app.listen({ port: 0, host: '127.0.0.1' });
            const { port } = ctx.app.server.address() as AddressInfo;
            const body = JSON.stringify({ email: 'nobody@example.com', password: 'whatever-it-is' });
            const answered = new Promise<number>((resolve, reject) => {
                const req = http.request(
                    {
                        host: '127.0.0.1',
                        port,
                        path: '/auth/login',
                        method: 'POST',
                        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
                    },
                    (res) => {
                        res.resume();
                        resolve(res.statusCode ?? 0);
                    }
                );
                req.on('error', reject);
                req.write(body.slice(0, 10));
                setTimeout(() => {
                    // the app is told to close while the body is still arriving
                    void ctx.app.close();
                    setTimeout(() => req.end(body.slice(10)), 100);
                }, 100);
            });
            expect(await answered).toBe(401);
        } finally {
            await ctx.close();
        }
    });

    it('ends an open live stream and finishes closing without waiting for it', async () => {
        const ctx = await createTestApp();
        try {
            const owner = await registerUser(ctx.app, 'owner@example.com');
            const id = await createDiagram(ctx.app, owner);
            await ctx.app.inject({ method: 'POST', url: `/diagrams/${id}/publish`, headers: as(owner), payload: {} });
            const { token } = (
                await ctx.app.inject({ method: 'POST', url: `/diagrams/${id}/share-links`, headers: as(owner), payload: { live: true, access: 'anyone' } })
            ).json();
            const base = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
            const res = await fetch(`${base}/s/${token}/events`);
            const reader = res.body!.getReader();
            await reader.read();
            const started = Date.now();
            await ctx.app.close();
            expect(Date.now() - started).toBeLessThan(3000);
            const end = await Promise.race([
                (async () => {
                    for (;;) if ((await reader.read()).done) return true;
                })(),
                new Promise<boolean>((r) => setTimeout(() => r(false), 2000)),
            ]);
            expect(end).toBe(true);
        } finally {
            await ctx.close();
        }
    });
});
