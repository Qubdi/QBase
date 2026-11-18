import { describe, expect, it } from 'vitest';
import { createMemoryCounters, type CounterStore } from '../src/lib/counters.js';
import { isForeignKeyViolation, isUniqueViolation } from '../src/lib/pg-errors.js';
import { sharedRateLimitStore } from '../src/lib/rate-limit-store.js';

type Result = { current: number; ttl: number } | undefined;

/** Calls a callback-style store method and resolves with what it reported. */
const call = (
    fn: (cb: (err: Error | null, res?: { current: number; ttl: number }) => void) => void
) =>
    new Promise<{ err: Error | null; res: Result }>((resolve) =>
        fn((err, res) => resolve({ err, res }))
    );

/** A store whose every call fails with the given value. */
const failing = (reason: unknown): CounterStore => ({
    hit: () => Promise.reject(reason),
    peek: () => Promise.reject(reason),
    clear: () => Promise.reject(reason),
});

describe('sharedRateLimitStore', () => {
    it('counts hits and reads them back without counting', async () => {
        const Store = sharedRateLimitStore(createMemoryCounters());
        const store = new Store();
        expect((await call((cb) => store.incr('203.0.113.1', cb, 60_000))).res?.current).toBe(1);
        expect((await call((cb) => store.incr('203.0.113.1', cb, 60_000))).res?.current).toBe(2);
        const read = await call((cb) => store.read('203.0.113.1', cb));
        expect(read.err).toBeNull();
        expect(read.res?.current).toBe(2);
        expect(read.res?.ttl).toBeGreaterThan(0);
        // reading did not count
        expect((await call((cb) => store.read('203.0.113.1', cb))).res?.current).toBe(2);
    });

    it('reads an address it has never seen as zero, with no time left', async () => {
        const Store = sharedRateLimitStore(createMemoryCounters());
        const read = await call((cb) => new Store().read('198.51.100.9', cb));
        expect(read).toEqual({ err: null, res: { current: 0, ttl: 0 } });
    });

    it('keeps each route’s count apart, and the same route’s together', async () => {
        const counters = createMemoryCounters();
        const Store = sharedRateLimitStore(counters);
        const root = new Store();
        const login = root.child({ routeInfo: { method: 'POST', url: '/auth/login' } });
        const share = root.child({ routeInfo: { method: 'GET', url: '/s/:token' } });
        // a second process builds its own child for the same route
        const loginElsewhere = new Store().child({
            routeInfo: { method: 'POST', url: '/auth/login' },
        });
        await call((cb) => login.incr('ip', cb, 60_000));
        await call((cb) => login.incr('ip', cb, 60_000));
        await call((cb) => share.incr('ip', cb, 60_000));
        expect((await call((cb) => loginElsewhere.read('ip', cb))).res?.current).toBe(2);
        expect((await call((cb) => share.read('ip', cb))).res?.current).toBe(1);
        // the plugin-wide store is a scope of its own
        expect((await call((cb) => root.read('ip', cb))).res?.current).toBe(0);
    });

    it('names a route with several methods, or none, without failing', async () => {
        const counters = createMemoryCounters();
        const Store = sharedRateLimitStore(counters);
        const many = new Store().child({
            routeInfo: { method: ['GET', 'HEAD'], url: '/x' },
        });
        const bare = new Store().child({});
        await call((cb) => many.incr('ip', cb, 60_000));
        await call((cb) => bare.incr('ip', cb, 60_000));
        expect(await counters.peek('ip:GET,HEAD:/x:ip')).toMatchObject({ count: 1 });
        // no method and no path: the scope is just the separator
        expect(await counters.peek('ip:::ip')).toMatchObject({ count: 1 });
    });

    it('hands a failing store’s error to the plugin', async () => {
        const boom = new Error('database down');
        const Store = sharedRateLimitStore(failing(boom));
        const store = new Store();
        expect((await call((cb) => store.incr('ip', cb, 1000))).err).toBe(boom);
        expect((await call((cb) => store.read('ip', cb))).err).toBe(boom);
    });

    it('wraps a rejection that is not an Error', async () => {
        const Store = sharedRateLimitStore(failing('timeout'));
        const store = new Store();
        const hit = await call((cb) => store.incr('ip', cb, 1000));
        expect(hit.err).toBeInstanceOf(Error);
        expect(hit.err?.message).toBe('timeout');
        const read = await call((cb) => store.read('ip', cb));
        expect(read.err).toBeInstanceOf(Error);
        expect(read.err?.message).toBe('timeout');
    });
});

describe('Postgres error codes', () => {
    it('finds the code on the error or up to two causes down', () => {
        expect(isUniqueViolation({ code: '23505' })).toBe(true);
        expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true);
        expect(isUniqueViolation({ cause: { cause: { code: '23505' } } })).toBe(true);
        // deeper than that is not looked at
        expect(isUniqueViolation({ cause: { cause: { cause: { code: '23505' } } } })).toBe(
            false
        );
    });

    it('tells the constraint kinds apart', () => {
        expect(isUniqueViolation({ code: '23503' })).toBe(false);
        expect(isForeignKeyViolation({ code: '23503' })).toBe(true);
        // `on delete restrict`
        expect(isForeignKeyViolation({ cause: { code: '23001' } })).toBe(true);
        expect(isForeignKeyViolation({ code: '23505' })).toBe(false);
    });

    it('is false for anything that is not a coded error', () => {
        for (const err of [null, undefined, 'boom', 23505, new Error('23505'), {}]) {
            expect(isUniqueViolation(err)).toBe(false);
            expect(isForeignKeyViolation(err)).toBe(false);
        }
        // a code of another type is not the code
        expect(isUniqueViolation({ code: 23505 })).toBe(false);
    });
});
