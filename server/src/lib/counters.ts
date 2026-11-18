import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';

/**
 * Counters inside a fixed window, for the rate limits and the sign-in
 * lockout. A window opens at the first hit on a key and closes `windowMs`
 * later; the count starts again after that.
 */
export interface CounterStore {
    /** Counts one hit; `count` includes it. */
    hit(key: string, windowMs: number): Promise<{ count: number; resetInMs: number }>;
    /** The live count and the time left in its window, without counting. */
    peek(key: string): Promise<{ count: number; resetInMs: number } | undefined>;
    /** Forgets the key. */
    clear(key: string): Promise<void>;
}

/** Counts in this process's memory; also what the shared store falls back to. */
export function createMemoryCounters(
    options: { maxKeys?: number; now?: () => number } = {}
): CounterStore {
    const { maxKeys = 10_000, now = () => Date.now() } = options;
    // A Map keeps insertion order, so the oldest windows are at the front.
    const windows = new Map<string, { count: number; resetAt: number }>();

    const live = (key: string, at: number) => {
        const w = windows.get(key);
        if (w && w.resetAt <= at) {
            windows.delete(key);
            return undefined;
        }
        return w;
    };

    return {
        async hit(key, windowMs) {
            const at = now();
            const w = live(key, at);
            if (w) {
                w.count++;
                return { count: w.count, resetInMs: w.resetAt - at };
            }
            // closed windows go first, then the oldest, so memory stays bounded
            for (const [k, v] of windows) {
                if (v.resetAt > at) break;
                windows.delete(k);
            }
            if (windows.size >= maxKeys) {
                windows.delete(windows.keys().next().value as string);
            }
            windows.set(key, { count: 1, resetAt: at + windowMs });
            return { count: 1, resetInMs: windowMs };
        },
        async peek(key) {
            const at = now();
            const w = live(key, at);
            return w && { count: w.count, resetInMs: w.resetAt - at };
        },
        async clear(key) {
            windows.delete(key);
        },
    };
}

/** Counts in Postgres, so every server process draws on the same numbers. */
export function createDbCounters(db: Db): CounterStore {
    return {
        async hit(key, windowMs) {
            // one statement: a window that has closed starts again at 1, an open
            // one counts up; the clock is the database's, so processes agree
            const res = await db.execute<{ count: number; left_ms: number }>(sql`
                insert into rate_counters (key, count, expires_at)
                values (${key}, 1, now() + (${windowMs}::double precision / 1000) * interval '1 second')
                on conflict (key) do update set
                    count = case when rate_counters.expires_at <= now()
                                 then 1 else rate_counters.count + 1 end,
                    expires_at = case when rate_counters.expires_at <= now()
                                      then excluded.expires_at else rate_counters.expires_at end
                returning count,
                    (extract(epoch from (expires_at - now())) * 1000)::bigint as left_ms
            `);
            const row = res.rows[0];
            if (!row) throw new Error('rate_counters: the upsert returned no row');
            return { count: Number(row.count), resetInMs: Number(row.left_ms) };
        },
        async peek(key) {
            const res = await db.execute<{ count: number; left_ms: number }>(sql`
                select count,
                    (extract(epoch from (expires_at - now())) * 1000)::bigint as left_ms
                from rate_counters
                where key = ${key} and expires_at > now()
            `);
            const row = res.rows[0];
            return row && { count: Number(row.count), resetInMs: Number(row.left_ms) };
        },
        async clear(key) {
            await db.execute(sql`delete from rate_counters where key = ${key}`);
        },
    };
}

/** How often a failing store may log, so an outage is one line a minute, not one per request. */
const WARN_EVERY_MS = 60_000;

/**
 * The shared counters with this process's memory behind them. When Postgres
 * cannot answer, the call is counted in memory instead and a warning is
 * logged (at most once a minute): a database outage must neither turn every
 * request away nor lock everyone out, and the limits then hold per process,
 * as they did before the counters were shared.
 */
export function createCounters(
    db: Db,
    warn: (err: unknown) => void = () => undefined
): CounterStore {
    const shared = createDbCounters(db);
    const memory = createMemoryCounters();
    let lastWarn = 0;
    const failed = (err: unknown) => {
        const at = Date.now();
        if (at - lastWarn >= WARN_EVERY_MS) {
            lastWarn = at;
            warn(err);
        }
    };
    return {
        async hit(key, windowMs) {
            try {
                return await shared.hit(key, windowMs);
            } catch (err) {
                failed(err);
                return memory.hit(key, windowMs);
            }
        },
        async peek(key) {
            try {
                return await shared.peek(key);
            } catch (err) {
                failed(err);
                return memory.peek(key);
            }
        },
        async clear(key) {
            // the memory copy goes too: it may hold counts from an outage
            await memory.clear(key);
            try {
                await shared.clear(key);
            } catch (err) {
                failed(err);
            }
        },
    };
}

declare module 'fastify' {
    interface FastifyInstance {
        /** the counters every limiter and lockout draws on */
        counters: CounterStore;
    }
}
