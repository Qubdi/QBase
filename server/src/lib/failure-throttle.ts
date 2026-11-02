/**
 * Counts failures per key (an email address, an account) and blocks the key
 * once it has `max` of them inside `windowMs`, until the window has passed
 * since the first one. Slows guessing of one account from many addresses,
 * which a per-address limit cannot. Kept in this process's memory, like the
 * other limiters (see "Run one server process" in the README).
 */
export function createFailureThrottle(options: {
    max: number;
    windowMs: number;
    /** most keys remembered; the oldest go first so memory stays bounded */
    maxKeys?: number;
}) {
    const { max, windowMs, maxKeys = 10_000 } = options;
    const failures = new Map<string, { count: number; resetAt: number }>();

    const live = (key: string, now: number) => {
        const f = failures.get(key);
        if (f && f.resetAt <= now) {
            failures.delete(key);
            return undefined;
        }
        return f;
    };

    return {
        /** Seconds until the key may try again, or 0 when it may now. */
        blockedFor(key: string, now = Date.now()): number {
            const f = live(key, now);
            return f && f.count >= max ? Math.ceil((f.resetAt - now) / 1000) : 0;
        },
        recordFailure(key: string, now = Date.now()) {
            const f = live(key, now);
            if (f) {
                f.count++;
                return;
            }
            if (failures.size >= maxKeys) {
                // Map keeps insertion order: drop the oldest entry
                failures.delete(failures.keys().next().value as string);
            }
            failures.set(key, { count: 1, resetAt: now + windowMs });
        },
        reset(key: string) {
            failures.delete(key);
        },
    };
}
