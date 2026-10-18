import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import {
    mfaChallenges,
    mfaRecoveryCodes,
    users,
} from '../db/schema.js';
import { CryptoBox } from '../introspect/crypto-box.js';
import { generateRecoveryCodes, hashRecoveryCode, verifyTotp } from './totp.js';

// Two-factor sign-in with an authenticator app: the database side. The codes
// themselves are in totp.ts; the HTTP side is in mfa-routes.ts.

/** How long the person has to type the code after the password was right. */
export const CHALLENGE_MINUTES = 5;
/** Wrong codes a challenge survives; then they start again from the password. */
export const CHALLENGE_MAX_ATTEMPTS = 5;

/** What the authenticator app shows as the service name. */
export const MFA_ISSUER = 'QubdiDB';

/**
 * Two-factor exists on this server: switched on (MFA_ENABLED) and a key to
 * encrypt secrets with. Without a key nobody can set it up, and that is not
 * an error: the feature just is not offered.
 */
export const mfaAvailable = (config: Pick<Config, 'mfaEnabled' | 'secretsKey'>) =>
    config.mfaEnabled && config.secretsKey !== null;

export interface Mfa {
    /** a fresh secret for the user, stored encrypted and still switched off */
    storePendingSecret(userId: string, secret: string): Promise<void>;
    /** the user's secret, or null when they have none */
    secretOf(userId: string): Promise<string | null>;
    /**
     * Checks a typed code. A step that was already accepted (or an older one)
     * fails, and so does a second request with the same code arriving at the
     * same moment: the step is stored by a conditional update.
     */
    checkCode(userId: string, code: string, now?: number): Promise<boolean>;
    /** Spends a recovery code: true once for each, never again. */
    spendRecoveryCode(userId: string, code: string): Promise<boolean>;
    /** Switches it on and replaces the recovery codes; they are returned once. */
    enable(userId: string): Promise<string[]>;
    /** Replaces the recovery codes with a fresh set; returned once. */
    renewRecoveryCodes(userId: string): Promise<string[]>;
    /** Switches it off: secret, codes and pending sign-ins all go. */
    clear(userId: string): Promise<void>;
    recoveryCodesLeft(userId: string): Promise<number>;
    /** Starts the second step of a sign-in; returns the ticket for the browser. */
    createChallenge(userId: string): Promise<string>;
    /**
     * Counts an attempt against a challenge and returns whose it is, or null
     * when it is unknown, expired or out of attempts. The count goes up before
     * the code is looked at, so parallel guesses cannot beat the limit.
     */
    useAttempt(ticket: string): Promise<{ id: string; userId: string } | null>;
    /** Consumes the challenge after success. False if someone else just did. */
    finishChallenge(id: string): Promise<boolean>;
}

const hashTicket = (ticket: string) =>
    createHash('sha256').update(ticket).digest('hex');

export function createMfa(
    db: Db,
    config: Pick<Config, 'secretsKey' | 'mfaWindowSteps'>
): Mfa {
    const box = () => {
        if (!config.secretsKey) throw new Error('No key to encrypt secrets with');
        return new CryptoBox(config.secretsKey);
    };
    // the secret is sealed together with its owner's id, so a copied value
    // does not open under another account
    const seal = (userId: string, secret: string) =>
        box().encrypt(`${userId}:${secret}`);
    const open = (userId: string, sealed: string) => {
        const plain = box().decrypt(sealed);
        if (!plain.startsWith(`${userId}:`)) {
            throw new Error('Secret belongs to another account');
        }
        return plain.slice(userId.length + 1);
    };

    const replaceCodes = async (userId: string) => {
        const codes = generateRecoveryCodes();
        await db.transaction(async (tx) => {
            await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
            await tx
                .insert(mfaRecoveryCodes)
                .values(codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })));
        });
        return codes;
    };

    const mfa: Mfa = {
        async storePendingSecret(userId, secret) {
            await db
                .update(users)
                .set({ mfaSecretEnc: seal(userId, secret), mfaLastStep: null })
                .where(eq(users.id, userId));
        },

        async secretOf(userId) {
            const [row] = await db
                .select({ enc: users.mfaSecretEnc })
                .from(users)
                .where(eq(users.id, userId));
            return row?.enc ? open(userId, row.enc) : null;
        },

        async checkCode(userId, code, now = Date.now()) {
            const [row] = await db
                .select({ enc: users.mfaSecretEnc, last: users.mfaLastStep })
                .from(users)
                .where(eq(users.id, userId));
            if (!row?.enc) return false;
            const result = verifyTotp({
                secret: open(userId, row.enc),
                code,
                now,
                windowSteps: config.mfaWindowSteps,
                lastStep: row.last,
            });
            if (!result.ok) return false;
            // the step is only taken if nobody took it (or a later one) first
            const taken = await db
                .update(users)
                .set({ mfaLastStep: result.step })
                .where(
                    and(
                        eq(users.id, userId),
                        or(isNull(users.mfaLastStep), lt(users.mfaLastStep, result.step))
                    )
                )
                .returning({ id: users.id });
            return taken.length === 1;
        },

        async spendRecoveryCode(userId, code) {
            const spent = await db
                .update(mfaRecoveryCodes)
                .set({ usedAt: sql`now()` })
                .where(
                    and(
                        eq(mfaRecoveryCodes.userId, userId),
                        eq(mfaRecoveryCodes.codeHash, hashRecoveryCode(code)),
                        isNull(mfaRecoveryCodes.usedAt)
                    )
                )
                .returning({ id: mfaRecoveryCodes.id });
            return spent.length === 1;
        },

        async enable(userId) {
            const codes = await replaceCodes(userId);
            await db
                .update(users)
                .set({ mfaEnabledAt: sql`now()` })
                .where(eq(users.id, userId));
            return codes;
        },

        renewRecoveryCodes: replaceCodes,

        async clear(userId) {
            await db.transaction(async (tx) => {
                await tx
                    .update(users)
                    .set({ mfaSecretEnc: null, mfaEnabledAt: null, mfaLastStep: null })
                    .where(eq(users.id, userId));
                await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
                await tx.delete(mfaChallenges).where(eq(mfaChallenges.userId, userId));
            });
        },

        async recoveryCodesLeft(userId) {
            const [row] = await db
                .select({ n: sql<number>`count(*)::int` })
                .from(mfaRecoveryCodes)
                .where(and(eq(mfaRecoveryCodes.userId, userId), isNull(mfaRecoveryCodes.usedAt)));
            return row.n;
        },

        async createChallenge(userId) {
            const ticket = randomBytes(32).toString('base64url');
            await db.transaction(async (tx) => {
                // one pending sign-in per account
                await tx.delete(mfaChallenges).where(eq(mfaChallenges.userId, userId));
                await tx.insert(mfaChallenges).values({
                    id: hashTicket(ticket),
                    userId,
                    expiresAt: new Date(Date.now() + CHALLENGE_MINUTES * 60_000),
                });
            });
            return ticket;
        },

        async useAttempt(ticket) {
            const id = hashTicket(ticket);
            const [row] = await db
                .update(mfaChallenges)
                .set({ attempts: sql`${mfaChallenges.attempts} + 1` })
                .where(
                    and(
                        eq(mfaChallenges.id, id),
                        gt(mfaChallenges.expiresAt, new Date()),
                        lt(mfaChallenges.attempts, CHALLENGE_MAX_ATTEMPTS)
                    )
                )
                .returning({ id: mfaChallenges.id, userId: mfaChallenges.userId });
            return row ?? null;
        },

        async finishChallenge(id) {
            const gone = await db
                .delete(mfaChallenges)
                .where(eq(mfaChallenges.id, id))
                .returning({ id: mfaChallenges.id });
            return gone.length === 1;
        },
    };
    return mfa;
}
