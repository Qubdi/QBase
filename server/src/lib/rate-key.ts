import { createHash } from 'node:crypto';
import net from 'node:net';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sessionTokenOf } from '../auth/sessions.js';
import { parseIPv6 } from '../introspect/net-guard.js';
import { createMemoryCounters, type CounterStore } from './counters.js';

/**
 * The key a client address is counted under. An IPv6 customer holds a whole
 * /64 (or more), so counting each address would give one client billions of
 * fresh buckets: IPv6 is cut to its /64 prefix. IPv4, and an IPv6 address
 * that wraps one (::ffff:a.b.c.d), count as the IPv4 address.
 */
export function addressKey(ip: string): string {
    if (!net.isIPv6(ip)) return ip;
    const b = parseIPv6(ip);
    if (!b) return ip;
    if (b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff) {
        return b.slice(12).join('.');
    }
    const group = (i: number) => ((b[i] << 8) | b[i + 1]).toString(16);
    return `${[0, 2, 4, 6].map(group).join(':')}::/64`;
}

/**
 * Rate-limit bucket for a signed-in user: their session, hashed so the raw
 * token never sits in the limiter's memory. Without a session cookie the
 * client address is used.
 */
export function userRateKey(req: FastifyRequest): string {
    const token = sessionTokenOf(req.cookies, req.protocol === 'https');
    return token
        ? `session:${createHash('sha256').update(token).digest('hex').slice(0, 24)}`
        : `ip:${addressKey(req.ip)}`;
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
