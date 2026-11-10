import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sessionTokenOf } from '../auth/sessions.js';
import { createMemoryCounters, type CounterStore } from './counters.js';

/**
 * Rate-limit bucket for a signed-in user: their session, hashed so the raw
 * token never sits in the limiter's memory. Without a session cookie the
 * client address is used.
 */
export function userRateKey(req: FastifyRequest): string {
    const token = sessionTokenOf(req.cookies);
    return token
        ? `session:${createHash('sha256').update(token).digest('hex').slice(0, 24)}`
        : `ip:${req.ip}`;
}

/** A Fastify route hook. */
export type RequestHook = (
    req: FastifyRequest,
    reply: FastifyReply
) => Promise<unknown>;

/**
 * One per-user allowance of `max` calls a minute that several routes draw
 * from (the rate-limit plugin counts every route on its own).
 *
 * Use the result as a `preHandler` hook on each route, not `onRequest`: it
 * counts the signed-in user, and the session is only known by then. Counting
 * earlier would key on whatever cookie a caller sends, so every junk cookie
 * would add an entry. A request without a user (the route's own check turns it
 * away first) falls back to its session or address.
 *
 * The calls are counted in the app's shared counters (`app.counters`), so the
 * allowance holds across every server process; an app without them, or a
 * database that does not answer, counts in this process's memory instead.
 * `name` tells this allowance from another in the shared store, so give each
 * allowance its own, the same in every process.
 */
export function sharedUserLimit(
    max: number,
    windowMs = 60_000,
    name = `limit:${max}:${windowMs}`
): RequestHook {
    const own = createMemoryCounters();
    return async (req: FastifyRequest, reply: FastifyReply) => {
        const key = req.user ? `user:${req.user.id}` : userRateKey(req);
        const store = (req.server as { counters?: CounterStore } | undefined)?.counters ?? own;
        const { count, resetInMs } = await store.hit(`rate:${name}:${key}`, windowMs);
        if (count > max) {
            return reply
                .code(429)
                .header('retry-after', Math.max(1, Math.ceil(resetInMs / 1000)))
                .send({
                    statusCode: 429,
                    error: 'Too Many Requests',
                    message: 'Rate limit exceeded, retry later',
                });
        }
    };
}
