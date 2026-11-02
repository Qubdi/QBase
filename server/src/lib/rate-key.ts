import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE } from '../auth/sessions.js';

// Every limiter here keeps its counts in this process's memory, so with several
// server processes each counts on its own (see "Scaling" in the README).

/**
 * Rate-limit bucket for a signed-in user: their session, hashed so the raw
 * token never sits in the limiter's memory. Without a session cookie the
 * client address is used.
 */
export function userRateKey(req: FastifyRequest): string {
    const token = req.cookies?.[SESSION_COOKIE];
    return token
        ? `session:${createHash('sha256').update(token).digest('hex').slice(0, 24)}`
        : `ip:${req.ip}`;
}

/** Route `config` that limits a route to `max` calls a minute per user. */
export const perUserLimit = (max: number) => ({
    config: {
        rateLimit: {
            max,
            timeWindow: '1 minute',
            keyGenerator: userRateKey,
        },
    },
});

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
 */
export function sharedUserLimit(
    max: number,
    windowMs = 60_000
): RequestHook {
    // A window opens when its key is first seen and entries are only ever added
    // at the end, so the map is in the order the windows close in.
    const windows = new Map<string, { count: number; resetAt: number }>();
    return async (req: FastifyRequest, reply: FastifyReply) => {
        const now = Date.now();
        // so only the entries that have closed are visited, not every one
        for (const [key, w] of windows) {
            if (w.resetAt > now) break;
            windows.delete(key);
        }
        const key = req.user ? `user:${req.user.id}` : userRateKey(req);
        const w = windows.get(key) ?? { count: 0, resetAt: now + windowMs };
        w.count++;
        windows.set(key, w);
        if (w.count > max) {
            return reply
                .code(429)
                .header('retry-after', Math.ceil((w.resetAt - now) / 1000))
                .send({
                    statusCode: 429,
                    error: 'Too Many Requests',
                    message: 'Rate limit exceeded, retry later',
                });
        }
    };
}
