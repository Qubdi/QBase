import { createMemoryCounters, type CounterStore } from './counters.js';

/**
 * Counts failures per key (an email address, an account) and blocks the key
 * once it has `max` of them inside `windowMs`, until the window has passed
 * since the first one. Slows guessing of one account from many addresses,
 * which a per-address limit cannot.
 *
 * The counts live in `store`, shared by every server process when it is the
 * database-backed one, so a lockout holds on all replicas. Without a store they
 * stay in this process's memory.
 */
export function createFailureThrottle(options: {
    max: number;
    windowMs: number;
    /** most keys remembered in memory when there is no shared store */
    maxKeys?: number;
    /** where the counts are kept; default: this process's memory */
    store?: CounterStore;
    /**
     * Tells this throttle's keys from another throttle's in a shared store.
     * Every process must give the same name to the same throttle.
     */
    name?: string;
}) {
    const { max, windowMs, maxKeys = 10_000, name = 'failures' } = options;
    const store = options.store ?? createMemoryCounters({ maxKeys });
    const keyOf = (key: string) => `throttle:${name}:${key}`;

    return {
        /** Seconds until the key may try again, or 0 when it may now. */
        async blockedFor(key: string): Promise<number> {
            const live = await store.peek(keyOf(key));
            return live && live.count >= max
                ? Math.max(1, Math.ceil(live.resetInMs / 1000))
                : 0;
        },
        /** Counts one failure; true when this one is the one that locks the key. */
        async recordFailure(key: string): Promise<boolean> {
            const { count } = await store.hit(keyOf(key), windowMs);
            return count === max;
        },
        async reset(key: string): Promise<void> {
            await store.clear(keyOf(key));
        },
    };
}
