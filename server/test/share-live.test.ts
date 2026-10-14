import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    as,
    createDiagram,
    createTestApp,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

/** Minimal SSE reader over a real socket. */
async function openStream(url: string) {
    const controller = new AbortController();
    const res = await fetch(url, { signal: controller.signal });
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    return {
        status: res.status,
        async readUntil(needle: string, ms = 4000): Promise<string> {
            const deadline = Date.now() + ms;
            while (!buffer.includes(needle)) {
                const left = deadline - Date.now();
                if (left <= 0 || !reader) throw new Error(`timeout waiting for ${needle}; got ${buffer}`);
                const chunk = await Promise.race([
                    reader.read(),
                    new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), left)),
                ]);
                if (chunk === 'timeout') throw new Error(`timeout waiting for ${needle}; got ${buffer}`);
                if (chunk.done) throw new Error(`stream ended; got ${buffer}`);
                buffer += decoder.decode(chunk.value);
            }
            return buffer;
        },
        async waitForEnd(ms = 4000): Promise<boolean> {
            if (!reader) return true;
            const deadline = Date.now() + ms;
            while (Date.now() < deadline) {
                const chunk = await Promise.race([
                    reader.read(),
                    new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), deadline - Date.now())),
                ]);
                if (chunk === 'timeout') return false;
                if (chunk.done) return true;
                buffer += decoder.decode(chunk.value);
            }
            return false;
        },
        close: () => controller.abort(),
    };
}

describe('live share viewer cap', () => {
    it('refuses viewers past the per-link limit and frees the slot on close', async () => {
        const ctx = await createTestApp({ sseMaxPerLink: 2 });
        try {
            const owner = await registerUser(ctx.app, 'owner@example.com');
            const id = await createDiagram(ctx.app, owner);
            await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${id}/publish`,
                headers: as(owner),
                payload: {},
            });
            const { token } = (
                await ctx.app.inject({
                    method: 'POST',
                    url: `/diagrams/${id}/share-links`,
                    headers: as(owner),
                    payload: { live: true },
                })
            ).json();
            const base = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
            const url = `${base}/s/${token}/events`;
            const a = await openStream(url);
            const b = await openStream(url);
            await a.readUntil(': connected');
            await b.readUntil(': connected');
            const c = await openStream(url);
            expect(c.status).toBe(429);
            c.close();
            a.close();
            // the slot is released once the first viewer is gone
            let status = 429;
            for (let i = 0; i < 20 && status === 429; i++) {
                await new Promise((r) => setTimeout(r, 100));
                const d = await openStream(url);
                status = d.status;
                d.close();
            }
            expect(status).toBe(200);
            b.close();
        } finally {
            await ctx.close();
        }
    });
});

describe('live share events (SSE)', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    let id: string;
    let base: string;

    const link = async (payload: object) =>
        (
            await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${id}/share-links`,
                headers: as(owner),
                payload,
            })
        ).json();
    const publish = () =>
        ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${id}/publish`,
            headers: as(owner),
            payload: {},
        });

    beforeAll(async () => {
        ctx = await createTestApp();
        owner = await registerUser(ctx.app, 'owner@example.com');
        id = await createDiagram(ctx.app, owner);
        await publish();
        base = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    });
    afterAll(() => ctx.close());

    it('is unavailable unless the link has live enabled', async () => {
        const { token } = await link({ live: false });
        const s = await openStream(`${base}/s/${token}/events`);
        expect(s.status).toBe(404);
        s.close();
    });

    it('is unavailable for bad tokens', async () => {
        const s = await openStream(`${base}/s/${'B'.repeat(22)}/events`);
        expect(s.status).toBe(404);
        s.close();
    });

    it('sends a version event to open viewers when a new version is published', async () => {
        const { token } = await link({ live: true });
        const s = await openStream(`${base}/s/${token}/events`);
        expect(s.status).toBe(200);
        await s.readUntil(': connected');
        const res = await publish();
        const version = res.json().version;
        const text = await s.readUntil('event: version');
        expect(text).toContain(`"version":${version}`);
        s.close();
    });

    it('does not leak events from other diagrams', async () => {
        const { token } = await link({ live: true });
        const s = await openStream(`${base}/s/${token}/events`);
        await s.readUntil(': connected');
        const other = await createDiagram(ctx.app, owner, 'Other');
        await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${other}/publish`,
            headers: as(owner),
            payload: {},
        });
        await expect(s.readUntil('event: version', 700)).rejects.toThrow(/timeout/);
        s.close();
    });

    it('cuts off viewers when the link is revoked', async () => {
        const made = await link({ live: true });
        const s = await openStream(`${base}/s/${made.token}/events`);
        await s.readUntil(': connected');
        await ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${id}/share-links/${made.id}`,
            headers: as(owner),
        });
        expect(await s.waitForEnd()).toBe(true);
        s.close();
    });

    it('cuts off viewers when live is switched off', async () => {
        const made = await link({ live: true });
        const s = await openStream(`${base}/s/${made.token}/events`);
        await s.readUntil(': connected');
        await ctx.app.inject({
            method: 'PATCH',
            url: `/diagrams/${id}/share-links/${made.id}`,
            headers: as(owner),
            payload: { live: false },
        });
        expect(await s.waitForEnd()).toBe(true);
        s.close();
    });

    it('cuts off viewers on the old URL when the token is regenerated', async () => {
        const made = await link({ live: true });
        const s = await openStream(`${base}/s/${made.token}/events`);
        await s.readUntil(': connected');
        await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${id}/share-links/${made.id}/regenerate`,
            headers: as(owner),
        });
        expect(await s.waitForEnd()).toBe(true);
        s.close();
    });
});
