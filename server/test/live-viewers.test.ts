import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { liveViewers } from '../src/db/schema.js';
import { purgeExpiredViewers } from '../src/share/viewers.js';
import {
    acquireViewer,
    releaseViewer,
    renewViewer,
    type ViewerCaps,
} from '../src/share/viewers.js';
import { as, createDiagram, createTestApp, registerUser, type TestCtx } from './helpers.js';

const caps = (over: Partial<ViewerCaps> = {}): ViewerCaps => ({
    maxPerLink: 3,
    maxPerIp: 5,
    ttlMs: 60_000,
    ...over,
});

describe('live viewers counted in Postgres', () => {
    let a: TestCtx;
    // a second server process: its own pool, the same database
    let b: TestCtx;

    beforeAll(async () => {
        a = await createTestApp();
        b = await createTestApp({}, undefined, false);
    });
    afterAll(async () => {
        await b.close();
        await a.close();
    });

    it('holds the per-link cap across two processes', async () => {
        const link = randomUUID();
        expect(await acquireViewer(a.db, link, '10.0.0.1', caps({ maxPerLink: 2 }))).toBeTruthy();
        expect(await acquireViewer(b.db, link, '10.0.0.2', caps({ maxPerLink: 2 }))).toBeTruthy();
        expect(await acquireViewer(a.db, link, '10.0.0.3', caps({ maxPerLink: 2 }))).toBeNull();
        expect(await acquireViewer(b.db, link, '10.0.0.4', caps({ maxPerLink: 2 }))).toBeNull();
    });

    it('holds the per-address cap over every link', async () => {
        const ip = '10.1.0.1';
        const c = caps({ maxPerIp: 2 });
        expect(await acquireViewer(a.db, randomUUID(), ip, c)).toBeTruthy();
        expect(await acquireViewer(b.db, randomUUID(), ip, c)).toBeTruthy();
        expect(await acquireViewer(a.db, randomUUID(), ip, c)).toBeNull();
        expect(await acquireViewer(a.db, randomUUID(), '10.1.0.2', c)).toBeTruthy();
    });

    it('lets exactly the cap through when many open at once from two processes', async () => {
        const link = randomUUID();
        const c = caps({ maxPerLink: 4, maxPerIp: 1000 });
        const results = await Promise.all(
            Array.from({ length: 20 }, (_, i) =>
                acquireViewer(i % 2 ? a.db : b.db, link, `10.2.0.${i}`, c)
            )
        );
        expect(results.filter(Boolean)).toHaveLength(4);
    });

    it('gives the slot back on release', async () => {
        const link = randomUUID();
        const c = caps({ maxPerLink: 1 });
        const id = await acquireViewer(a.db, link, '10.3.0.1', c);
        expect(await acquireViewer(b.db, link, '10.3.0.2', c)).toBeNull();
        await releaseViewer(b.db, id!);
        expect(await acquireViewer(b.db, link, '10.3.0.2', c)).toBeTruthy();
    });

    it('stops counting a viewer nobody renewed, and keeps counting one that is', async () => {
        const link = randomUUID();
        const c = caps({ maxPerLink: 1, ttlMs: 1000 });
        const t0 = new Date();
        const id = await acquireViewer(a.db, link, '10.4.0.1', c, t0);
        // within its time: still counted
        expect(await acquireViewer(a.db, link, '10.4.0.2', c, new Date(t0.getTime() + 500))).toBeNull();
        // renewed at 900 ms: counted until 1900 ms
        await renewViewer(a.db, id!, link, '10.4.0.1', c.ttlMs, new Date(t0.getTime() + 900));
        expect(await acquireViewer(a.db, link, '10.4.0.2', c, new Date(t0.getTime() + 1500))).toBeNull();
        // never renewed again: gone after 1900 ms
        expect(await acquireViewer(a.db, link, '10.4.0.2', c, new Date(t0.getTime() + 2000))).toBeTruthy();
    });

    it('puts back a row the purge removed while its stream lived', async () => {
        const link = randomUUID();
        const id = await acquireViewer(a.db, link, '10.5.0.1', caps());
        await releaseViewer(a.db, id!);
        await renewViewer(a.db, id!, link, '10.5.0.1', 60_000);
        const rows = await a.db.select().from(liveViewers);
        expect(rows.filter((r) => r.id === id)).toHaveLength(1);
    });

    it('purges expired rows only', async () => {
        const link = randomUUID();
        const old = new Date(Date.now() - 3_600_000);
        await acquireViewer(a.db, link, '10.6.0.1', caps({ ttlMs: 1000 }), old);
        const live = await acquireViewer(a.db, link, '10.6.0.2', caps());
        expect(await purgeExpiredViewers(a.db)).toBeGreaterThanOrEqual(1);
        const rows = (await a.db.select().from(liveViewers)).filter((r) => r.linkId === link);
        expect(rows.map((r) => r.id)).toEqual([live]);
    });
});

describe('the live stream endpoint with two processes', () => {
    it('counts viewers of both against one cap and frees the slot on close', async () => {
        const a = await createTestApp({ sseMaxPerLink: 2 });
        const b = await createTestApp({ sseMaxPerLink: 2 }, undefined, false);
        try {
            const owner = await registerUser(a.app, 'owner@example.com');
            const id = await createDiagram(a.app, owner);
            await a.app.inject({ method: 'POST', url: `/diagrams/${id}/publish`, headers: as(owner), payload: {} });
            const { token } = (
                await a.app.inject({ method: 'POST', url: `/diagrams/${id}/share-links`, headers: as(owner), payload: { live: true } })
            ).json();
            const baseA = await a.app.listen({ port: 0, host: '127.0.0.1' });
            const baseB = await b.app.listen({ port: 0, host: '127.0.0.1' });
            const open = async (base: string) => {
                const ctl = new AbortController();
                const res = await fetch(`${base}/s/${token}/events`, { signal: ctl.signal });
                return { status: res.status, close: () => ctl.abort() };
            };
            const one = await open(baseA);
            const two = await open(baseB);
            expect([one.status, two.status]).toEqual([200, 200]);
            // the link holds two viewers in total, whichever process takes the third
            const three = await open(baseA);
            const four = await open(baseB);
            expect([three.status, four.status]).toEqual([429, 429]);
            one.close();
            let status = 429;
            for (let i = 0; i < 30 && status === 429; i++) {
                await new Promise((r) => setTimeout(r, 100));
                const again = await open(baseB);
                status = again.status;
                again.close();
            }
            expect(status).toBe(200);
            two.close();
        } finally {
            await b.close();
            await a.close();
        }
    });
});
