import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessions } from '../src/db/schema.js';
import {
    as,
    createDiagram,
    createTestApp,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

/** Minimal SSE reader over a real socket. */
async function openStream(url: string, headers: Record<string, string> = {}) {
    const controller = new AbortController();
    const res = await fetch(url, { signal: controller.signal, headers });
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

describe('live share stream headers', () => {
    it('carries the same security headers as every other API response', async () => {
        const ctx = await createTestApp();
        try {
            const owner = await registerUser(ctx.app, 'owner@example.com');
            const id = await createDiagram(ctx.app, owner);
            await ctx.app.inject({ method: 'POST', url: `/diagrams/${id}/publish`, headers: as(owner), payload: {} });
            const { token } = (
                await ctx.app.inject({ method: 'POST', url: `/diagrams/${id}/share-links`, headers: as(owner), payload: { live: true } })
            ).json();
            const base = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
            const controller = new AbortController();
            const stream = await fetch(`${base}/s/${token}/events`, { signal: controller.signal });
            const normal = await ctx.app.inject({ url: `/s/${token}` });
            controller.abort();
            expect(stream.status).toBe(200);
            for (const name of ['x-content-type-options', 'x-frame-options', 'referrer-policy', 'content-security-policy']) {
                expect(stream.headers.get(name), name).toBe(String(normal.headers[name]));
            }
        } finally {
            await ctx.close();
        }
    });
});

describe("live share stream and the viewer's session", () => {
    const setup = async (access: 'signed_in' | 'anyone') => {
        const ctx = await createTestApp({ sseHeartbeatSeconds: 1 });
        const owner = await registerUser(ctx.app, 'owner@example.com');
        const id = await createDiagram(ctx.app, owner);
        await ctx.app.inject({ method: 'POST', url: `/diagrams/${id}/publish`, headers: as(owner), payload: {} });
        const { token } = (
            await ctx.app.inject({ method: 'POST', url: `/diagrams/${id}/share-links`, headers: as(owner), payload: { live: true, access } })
        ).json();
        const base = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
        return { ctx, owner, url: `${base}/s/${token}/events` };
    };

    it("closes a signed-in viewer's stream once their session ends", async () => {
        const { ctx, owner, url } = await setup('signed_in');
        try {
            const stream = await openStream(url, { cookie: owner.cookie });
            expect(stream.status).toBe(200);
            await stream.readUntil(': connected');
            await ctx.db.delete(sessions);
            expect(await stream.waitForEnd(5000)).toBe(true);
        } finally {
            await ctx.close();
        }
    });

    it('keeps a stream for a signed-in viewer whose session is alive', async () => {
        const { ctx, owner, url } = await setup('signed_in');
        try {
            const stream = await openStream(url, { cookie: owner.cookie });
            await stream.readUntil(': connected');
            await stream.readUntil(': ping', 4000);
            stream.close();
        } finally {
            await ctx.close();
        }
    });

    it('does not tie a link open to anyone to a session', async () => {
        const { ctx, url } = await setup('anyone');
        try {
            const stream = await openStream(url);
            await stream.readUntil(': connected');
            await stream.readUntil(': ping', 4000);
            stream.close();
        } finally {
            await ctx.close();
        }
    });
});

describe('live share viewer cap per address', () => {
    it('stops one address at its limit across links, and frees the slot on close', async () => {
        const ctx = await createTestApp({ sseMaxPerIp: 2 });
        try {
            const owner = await registerUser(ctx.app, 'owner@example.com');
            const urls: string[] = [];
            const base = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
            for (let n = 0; n < 3; n++) {
                const id = await createDiagram(ctx.app, owner, `Diagram ${n}`);
                await ctx.app.inject({ method: 'POST', url: `/diagrams/${id}/publish`, headers: as(owner), payload: {} });
                const { token } = (
                    await ctx.app.inject({ method: 'POST', url: `/diagrams/${id}/share-links`, headers: as(owner), payload: { live: true } })
                ).json();
                urls.push(`${base}/s/${token}/events`);
            }
            const a = await openStream(urls[0]);
            const b = await openStream(urls[1]);
            await a.readUntil(': connected');
            await b.readUntil(': connected');
            // a third link, same address: refused even though that link has no viewers
            const c = await openStream(urls[2]);
            expect(c.status).toBe(429);
            c.close();
            a.close();
            let status = 429;
            for (let i = 0; i < 20 && status === 429; i++) {
                await new Promise((r) => setTimeout(r, 100));
                const d = await openStream(urls[2]);
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
