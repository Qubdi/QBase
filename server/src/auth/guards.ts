import type { FastifyReply } from 'fastify';
import type { Config } from '../config.js';
import { createFailureThrottle } from '../lib/failure-throttle.js';
import type { MfaGuard } from './mfa-routes.js';

/** the all-addresses ceiling on failures at one account, as a multiple of AUTH_MAX_FAILURES */
const ACCOUNT_FAILURE_FACTOR = 5;

/** The failure counters that sign-in, the account screens and the admin step-up all share. */
export interface AuthGuards {
    failures: ReturnType<typeof createFailureThrottle>;
    /** failures at one account from every address together */
    accountFailures: ReturnType<typeof createFailureThrottle>;
    /** answers 429 and returns true while the key is locked out */
    locked: (reply: FastifyReply, key: string) => boolean;
    mfaGuard: MfaGuard;
}

/**
 * One set per server. Everything that asks for a password or a code counts its
 * failures here, so a lockout reached through one door holds at the others.
 */
export function createAuthGuards(
    config: Pick<Config, 'authMaxFailures' | 'authLockoutMinutes'>
): AuthGuards {
    const failures = createFailureThrottle({
        max: config.authMaxFailures,
        windowMs: config.authLockoutMinutes * 60_000,
    });
    // Failures at one account from every address together. The ceiling is well
    // above the per-address one, so a stranger cannot cheaply keep the owner
    // out, but guesses spread over many addresses still run into it.
    const accountFailures = createFailureThrottle({
        max: config.authMaxFailures * ACCOUNT_FAILURE_FACTOR,
        windowMs: config.authLockoutMinutes * 60_000,
    });
    const locked = (reply: FastifyReply, key: string) => {
        const wait = failures.blockedFor(key);
        if (wait === 0) return false;
        reply
            .code(429)
            .header('retry-after', wait)
            .send({ error: 'too_many_attempts' });
        return true;
    };

    // The second-step (code) lockout. It is keyed by account and address, so
    // someone who holds the password cannot lock the owner out of their own
    // second step by failing it from elsewhere; codes guessed from many
    // addresses are held back by the all-addresses ceiling.
    const mfaGuard: MfaGuard = {
        locked(reply, req, userId) {
            if (locked(reply, `mfa:${userId}:${req.ip}`)) return true;
            const wait = accountFailures.blockedFor(`mfa:${userId}`);
            if (wait === 0) return false;
            reply
                .code(429)
                .header('retry-after', wait)
                .send({ error: 'too_many_attempts' });
            return true;
        },
        fail(req, userId) {
            const addressLocked = failures.recordFailure(`mfa:${userId}:${req.ip}`);
            const accountLocked = accountFailures.recordFailure(`mfa:${userId}`);
            return addressLocked || accountLocked;
        },
        reset(req, userId) {
            failures.reset(`mfa:${userId}:${req.ip}`);
            accountFailures.reset(`mfa:${userId}`);
        },
    };
    return { failures, accountFailures, locked, mfaGuard };
}
