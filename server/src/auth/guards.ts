import type { FastifyReply } from 'fastify';
import type { Config } from '../config.js';
import type { CounterStore } from '../lib/counters.js';
import { addressKey } from '../lib/rate-key.js';
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
    locked: (reply: FastifyReply, key: string) => Promise<boolean>;
    mfaGuard: MfaGuard;
}

/**
 * One set per server. Everything that asks for a password or a code counts its
 * failures here, so a lockout reached through one door holds at the others.
 * With a shared `store` (the app's database-backed counters) it holds on every
 * server process too; without one the counts stay in this process.
 */
export function createAuthGuards(
    config: Pick<Config, 'authMaxFailures' | 'authLockoutMinutes'>,
    store?: CounterStore
): AuthGuards {
    const failures = createFailureThrottle({
        max: config.authMaxFailures,
        windowMs: config.authLockoutMinutes * 60_000,
        store,
        name: 'address',
    });
    // Failures at one account from every address together. The ceiling is well
    // above the per-address one, so a stranger cannot cheaply keep the owner
    // out, but guesses spread over many addresses still run into it.
    const accountFailures = createFailureThrottle({
        max: config.authMaxFailures * ACCOUNT_FAILURE_FACTOR,
        windowMs: config.authLockoutMinutes * 60_000,
        store,
        name: 'account',
    });
    const locked = async (reply: FastifyReply, key: string) => {
        const wait = await failures.blockedFor(key);
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
        async locked(reply, req, userId) {
            if (await locked(reply, `mfa:${userId}:${addressKey(req.ip)}`)) return true;
            const wait = await accountFailures.blockedFor(`mfa:${userId}`);
            if (wait === 0) return false;
            reply
                .code(429)
                .header('retry-after', wait)
                .send({ error: 'too_many_attempts' });
            return true;
        },
        async fail(req, userId) {
            const addressLocked = await failures.recordFailure(`mfa:${userId}:${addressKey(req.ip)}`);
            const accountLocked = await accountFailures.recordFailure(`mfa:${userId}`);
            return addressLocked || accountLocked;
        },
        async reset(req, userId) {
            await failures.reset(`mfa:${userId}:${addressKey(req.ip)}`);
            await accountFailures.reset(`mfa:${userId}`);
        },
    };
    return { failures, accountFailures, locked, mfaGuard };
}
