import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { SESSION_COOKIE } from '../auth/sessions.js';

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
