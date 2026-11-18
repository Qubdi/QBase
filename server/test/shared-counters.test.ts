import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/client.js';
import { createDb } from '../src/db/client.js';
import { holdDriftLock } from '../src/drift/service.js';
import {
    createCounters,
    createDbCounters,
    createMemoryCounters,
} from '../src/lib/counters.js';
import { createFailureThrottle } from '../src/lib/failure-throttle.js';
import { purgeExpiredCounters } from '../src/maintenance.js';
import { rateCounters } from '../src/db/schema.js';
import { as, createTestApp, registerUser, TEST_URL, type TestCtx } from './helpers.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('counters shared through Postgres', () => {
    let a: TestCtx;
    // a second server process: its own pool and app, the same database
    let b: TestCtx;

    beforeAll(async () => {
        a = await createTestApp();
        b = await createTestApp({}, undefined, false);
    });
    afterAll(async () => {
        await b.close();
        await a.close();
    });

    describe('the counter store', () => {
        it('SEC-036: holds a window of 30 days, longer than a 32-bit count of milliseconds', async () => {
            const store = createDbCounters(a.db);
            const month = 30 * 86_400_000;
            const first = await store.hit('t:month', month);
            expect(first.count).toBe(1);
            expect(first.resetInMs).toBeGreaterThan(month - 60_000);
            const seen = await store.peek('t:month');
            expect(seen?.count).toBe(1);
            expect(seen?.resetInMs).toBeGreaterThan(month - 60_000);
            await store.clear('t:month');
        });

        it('counts up inside a window and reports the time left', async () => {
            const store = createDbCounters(a.db);
            expect((await store.hit('t:up', 60_000)).count).toBe(1);
            const second = await store.hit('t:up', 60_000);
            expect(second.count).toBe(2);
            expect(second.resetInMs).toBeGreaterThan(55_000);
            expect(second.resetInMs).toBeLessThanOrEqual(60_000);
            expect((await store.peek('t:up'))?.count).toBe(2);
            // a peek counts nothing
            expect((await store.peek('t:up'))?.count).toBe(2);
        });

        it('starts again at one once the window has closed', async () => {
            const store = createDbCounters(a.db);
            await store.hit('t:expire', 150);
            await store.hit('t:expire', 150);
            await sleep(250);
            expect(await store.peek('t:expire')).toBeUndefined();
            expect((await store.hit('t:expire', 150)).count).toBe(1);
        });

        it('forgets a cleared key', async () => {
            const store = createDbCounters(a.db);
            await store.hit('t:clear', 60_000);
            await store.clear('t:clear');
            expect(await store.peek('t:clear')).toBeUndefined();
        });

        it('counts exactly when many callers hit at once, from two processes', async () => {
            const sa = createDbCounters(a.db);
            const sb = createDbCounters(b.db);
            const results = await Promise.all(
                Array.from({ length: 60 }, (_, i) =>
                    (i % 2 ? sa : sb).hit('t:race', 60_000)
                )
            );
            expect(results.map((r) => r.count).sort((x, y) => x - y)).toEqual(
                Array.from({ length: 60 }, (_, i) => i + 1)
            );
            expect((await sa.peek('t:race'))?.count).toBe(60);
        });

        it('behaves the same in memory', async () => {
            let now = 1_000;
            const store = createMemoryCounters({ now: () => now });
            expect((await store.hit('k', 100)).count).toBe(1);
            expect((await store.hit('k', 100)).count).toBe(2);
            now += 101;
            expect(await store.peek('k')).toBeUndefined();
            expect((await store.hit('k', 100)).count).toBe(1);
            await store.clear('k');
            expect(await store.peek('k')).toBeUndefined();
        });

        it('deletes the windows that have closed and keeps the open ones', async () => {
            const store = createDbCounters(a.db);
            await store.hit('t:purge-old', 50);
            await store.hit('t:purge-live', 60_000);
            await sleep(150);
            expect(await purgeExpiredCounters(a.db)).toBeGreaterThanOrEqual(1);
            const left = (await a.db.select().from(rateCounters)).map((r) => r.key);
            expect(left).toContain('t:purge-live');
            expect(left).not.toContain('t:purge-old');
        });
    });

    describe('when Postgres cannot answer', () => {
        it('counts in memory and warns once', async () => {
            const down = {
                execute: () => Promise.reject(new Error('database down')),
            } as unknown as Db;
            const warn = vi.fn();
            const counters = createCounters(down, warn);
            expect((await counters.hit('k', 60_000)).count).toBe(1);
            expect((await counters.hit('k', 60_000)).count).toBe(2);
            expect((await counters.peek('k'))?.count).toBe(2);
            await counters.clear('k');
            expect(await counters.peek('k')).toBeUndefined();
            // an outage is one line a minute, not one per call
            expect(warn).toHaveBeenCalledTimes(1);
        });
    });

    describe('the failure throttle', () => {
        it('locks a key on every process once the failures add up', async () => {
            const make = (db: Db) =>
                createFailureThrottle({
                    max: 3,
                    windowMs: 60_000,
                    store: createDbCounters(db),
                    name: 'test-throttle',
                });
            const one = make(a.db);
            const two = make(b.db);
            expect(await one.recordFailure('who')).toBe(false);
            expect(await two.recordFailure('who')).toBe(false);
            expect(await one.blockedFor('who')).toBe(0);
            // the third failure, counted on the other process, is the one that locks
            expect(await two.recordFailure('who')).toBe(true);
            expect(await one.blockedFor('who')).toBeGreaterThan(0);
            expect(await two.blockedFor('who')).toBeGreaterThan(0);
            await one.reset('who');
            expect(await two.blockedFor('who')).toBe(0);
        });

        it('keeps two throttles apart in one store', async () => {
            const store = createDbCounters(a.db);
            const x = createFailureThrottle({ max: 1, windowMs: 60_000, store, name: 'x' });
            const y = createFailureThrottle({ max: 1, windowMs: 60_000, store, name: 'y' });
            await x.recordFailure('same');
            expect(await x.blockedFor('same')).toBeGreaterThan(0);
            expect(await y.blockedFor('same')).toBe(0);
        });
    });

    describe('the drift check lock', () => {
        it('lets one process hold a diagram at a time and frees it when released', async () => {
            const id = '11111111-1111-4111-8111-111111111111';
            const release = await holdDriftLock(a.db, id);
            expect(release).not.toBeNull();
            expect(await holdDriftLock(b.db, id)).toBeNull();
            // another diagram is free
            const other = await holdDriftLock(b.db, '22222222-2222-4222-8222-222222222222');
            expect(other).not.toBeNull();
            await release!();
            const again = await holdDriftLock(b.db, id);
            expect(again).not.toBeNull();
            await again!();
            await other!();
        });

        it('frees the lock when the holding connection is lost, without crashing', async () => {
            const id = '33333333-3333-4333-8333-333333333333';
            const { db, pool } = createDb(TEST_URL);
            try {
                const release = await holdDriftLock(db, id);
                expect(release).not.toBeNull();
                expect(await holdDriftLock(a.db, id)).toBeNull();
                // the holder's connection dies, as when its process or the network does
                const holder = await a.db.$client.query<{ pid: number }>(
                    `select pid from pg_locks
                     where locktype = 'advisory' and granted
                       and ((classid::bigint << 32) | objid::bigint) = hashtextextended($1, 0)`,
                    [`drift:${id}`]
                );
                expect(holder.rows).toHaveLength(1);
                for (const row of holder.rows) {
                    await a.db.$client.query('select pg_terminate_backend($1)', [row.pid]);
                }
                await sleep(200);
                const taken = await holdDriftLock(a.db, id);
                expect(taken).not.toBeNull();
                await taken!();
                // releasing on the dead connection must not throw
                await release!();
            } finally {
                await pool.end();
            }
        });
    });
});

describe('limits that hold across two server processes', () => {
    it('counts one signed-in user over both, against one allowance', async () => {
        const a = await createTestApp({}, undefined, true, 4);
        const b = await createTestApp({}, undefined, false, 4);
        try {
            const user = await registerUser(a.app, 'shared@example.com');
            const call = (ctx: TestCtx) =>
                ctx.app.inject({ url: '/auth/me', headers: as(user) });
            // each process sees only part of the calls; together they pass the allowance
            const codes = [
                (await call(a)).statusCode,
                (await call(b)).statusCode,
                (await call(a)).statusCode,
                (await call(b)).statusCode,
                (await call(a)).statusCode,
                (await call(b)).statusCode,
            ];
            const first429 = codes.indexOf(429);
            expect(first429).toBeGreaterThan(0);
            expect(first429).toBeLessThanOrEqual(4);
            expect(codes.slice(first429).every((c) => c === 429)).toBe(true);
        } finally {
            await b.close();
            await a.close();
        }
    });

    it('counts one address over both, against one per-address limit', async () => {
        const a = await createTestApp({ authRateLimit: 3 });
        const b = await createTestApp({ authRateLimit: 3 }, undefined, false);
        try {
            const post = (ctx: TestCtx) =>
                ctx.app.inject({
                    method: 'POST',
                    url: '/auth/login',
                    payload: { email: 'nobody@example.com', password: 'Wrong-password-1!' },
                });
            const codes: number[] = [];
            for (const ctx of [a, b, a, b, a]) codes.push((await post(ctx)).statusCode);
            expect(codes.slice(0, 3)).toEqual([401, 401, 401]);
            expect(codes.slice(3)).toEqual([429, 429]);
        } finally {
            await b.close();
            await a.close();
        }
    });

    it('locks an account out on both once the failures add up', async () => {
        const a = await createTestApp({ authMaxFailures: 3 });
        const b = await createTestApp({ authMaxFailures: 3 }, undefined, false);
        try {
            await registerUser(a.app, 'lockme@example.com', 'Right-password-1!');
            const login = (ctx: TestCtx, password: string) =>
                ctx.app.inject({
                    method: 'POST',
                    url: '/auth/login',
                    payload: { email: 'lockme@example.com', password },
                });
            expect((await login(a, 'Wrong-password-1!')).statusCode).toBe(401);
            expect((await login(b, 'Wrong-password-1!')).statusCode).toBe(401);
            expect((await login(a, 'Wrong-password-1!')).statusCode).toBe(401);
            // three failures between them: both processes now turn the account's address away,
            // even with the right password
            const onA = await login(a, 'Right-password-1!');
            const onB = await login(b, 'Right-password-1!');
            expect(onA.statusCode).toBe(429);
            expect(onB.statusCode).toBe(429);
            expect(Number(onB.headers['retry-after'])).toBeGreaterThan(0);
        } finally {
            await b.close();
            await a.close();
        }
    });
});
