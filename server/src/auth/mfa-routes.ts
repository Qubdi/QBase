import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit/audit.js';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
import type { createFailureThrottle } from '../lib/failure-throttle.js';
import { mfaAvailable, MFA_ISSUER, type Mfa } from './mfa.js';
import { verifyPassword } from './password.js';
import { generateSecret, otpauthUrl } from './totp.js';

type Failures = ReturnType<typeof createFailureThrottle>;

export interface MfaRouteDeps {
    db: Db;
    config: Config;
    mfa: Mfa;
    failures: Failures;
    /** answers 429 and returns true while the key is locked out */
    locked: (reply: FastifyReply, key: string) => boolean;
    /** route options with the per-address rate limit */
    limit: object;
    /** sets the session cookie and records the sign-in */
    startSession: (
        req: FastifyRequest,
        reply: FastifyReply,
        userId: string
    ) => Promise<void>;
}

// a code from the app, or one recovery code; never both
const factor = {
    code: z.string().max(20).optional(),
    recoveryCode: z.string().max(40).optional(),
};
const hasFactor = (b: { code?: string; recoveryCode?: string }) =>
    (b.code !== undefined) !== (b.recoveryCode !== undefined);
const needOneFactor = {
    message: 'Send either code or recoveryCode',
};

const loginBody = z
    .object({ challenge: z.string().min(1).max(200), ...factor })
    .refine(hasFactor, needOneFactor);
const enableBody = z.object({
    password: z.string().max(200),
    code: z.string().max(20),
});
const disableBody = z
    .object({ password: z.string().max(200), ...factor })
    .refine(hasFactor, needOneFactor);
const renewBody = z.object({
    password: z.string().max(200),
    code: z.string().max(20),
});

/**
 * Two-factor with an authenticator app. Registered inside the auth routes (so
 * under /auth and sharing their lockout), and only when MFA_ENABLED is not
 * false: with it off these endpoints do not exist.
 */
export const mfaRoutes =
    (deps: MfaRouteDeps): FastifyPluginAsync =>
    async (app) => {
        const { db, config, mfa, failures, locked, limit, startSession } = deps;

        /**
         * One second factor: a code from the app, or a recovery code (spent
         * here). Returns which kind worked, or null.
         */
        const checkFactor = async (
            userId: string,
            body: { code?: string; recoveryCode?: string }
        ): Promise<'code' | 'recovery' | null> => {
            if (body.code !== undefined) {
                return (await mfa.checkCode(userId, body.code)) ? 'code' : null;
            }
            if (body.recoveryCode !== undefined) {
                return (await mfa.spendRecoveryCode(userId, body.recoveryCode))
                    ? 'recovery'
                    : null;
            }
            return null;
        };

        const refuseUnavailable = (reply: FastifyReply) =>
            reply.code(503).send({ error: 'mfa_unavailable' });

        // ---- second step of signing in ----

        app.post('/login/mfa', limit, async (req, reply) => {
            const body = loginBody.parse(req.body);
            const challenge = await mfa.useAttempt(body.challenge);
            if (!challenge) {
                return reply.code(401).send({ error: 'invalid_challenge' });
            }
            const key = `mfa:${challenge.userId}`;
            // guesses over several challenges count against the account too
            if (locked(reply, key)) return;
            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.id, challenge.userId));
            if (!user || !user.isActive || !user.mfaEnabledAt) {
                return reply.code(401).send({ error: 'invalid_challenge' });
            }
            const used = await checkFactor(user.id, body);
            if (!used) {
                failures.recordFailure(key);
                await audit(db, { userId: user.id, action: 'mfa.failed' });
                return reply.code(401).send({ error: 'invalid_code' });
            }
            // one use: a parallel request with the same ticket loses here
            if (!(await mfa.finishChallenge(challenge.id))) {
                return reply.code(401).send({ error: 'invalid_challenge' });
            }
            failures.reset(key);
            await startSession(req, reply, user.id);
            if (used === 'recovery') {
                await audit(db, { userId: user.id, action: 'mfa.recovery_used' });
            }
            await audit(db, { userId: user.id, action: 'user.sign_in' });
            return {
                id: user.id,
                email: user.email,
                isAdmin: user.isAdmin,
                mustChangePassword: user.mustChangePassword,
                mfaEnabled: true,
            };
        });

        // ---- the signed-in person's own settings ----

        app.get('/mfa', async (req, reply) => {
            if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
            const [row] = await db
                .select({ enabledAt: users.mfaEnabledAt })
                .from(users)
                .where(eq(users.id, req.user.id));
            return {
                available: mfaAvailable(config),
                enabled: row.enabledAt !== null,
                enabledAt: row.enabledAt,
                recoveryCodesLeft: row.enabledAt
                    ? await mfa.recoveryCodesLeft(req.user.id)
                    : 0,
            };
        });

        // a new secret, kept (encrypted) but not yet switched on. Asking again
        // replaces it, so an abandoned setup leaves nothing behind that works.
        app.post('/mfa/setup', limit, async (req, reply) => {
            if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
            if (!mfaAvailable(config)) return refuseUnavailable(reply);
            if (req.user.mfaEnabled) {
                return reply.code(409).send({ error: 'already_enabled' });
            }
            const secret = generateSecret();
            await mfa.storePendingSecret(req.user.id, secret);
            return {
                // shown once, for typing into an app that cannot scan
                secret,
                otpauthUrl: otpauthUrl({
                    secret,
                    account: req.user.email,
                    issuer: MFA_ISSUER,
                }),
            };
        });

        // proves the app shows the right codes, then switches it on
        app.post('/mfa/enable', limit, async (req, reply) => {
            if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
            if (!mfaAvailable(config)) return refuseUnavailable(reply);
            const body = enableBody.parse(req.body);
            if (req.user.mfaEnabled) {
                return reply.code(409).send({ error: 'already_enabled' });
            }
            // the password first, so a stolen session cannot switch it on and
            // leave the owner asked for a code they do not have
            const user = await checkPassword(req, reply, body.password);
            if (!user) return;
            const key = `mfa:${req.user.id}`;
            if ((await mfa.secretOf(req.user.id)) === null) {
                return reply.code(409).send({ error: 'setup_first' });
            }
            if (!(await mfa.checkCode(req.user.id, body.code))) {
                failures.recordFailure(key);
                await audit(db, { userId: req.user.id, action: 'mfa.failed' });
                return reply.code(400).send({ error: 'invalid_code' });
            }
            failures.reset(key);
            const recoveryCodes = await mfa.enable(req.user.id);
            await audit(db, { userId: req.user.id, action: 'mfa.enable' });
            // the only time they are shown: only their hashes are kept
            return { recoveryCodes };
        });

        // password and a second factor, so a stolen session cannot switch it off
        app.post('/mfa/disable', limit, async (req, reply) => {
            if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
            if (!config.secretsKey) return refuseUnavailable(reply);
            const body = disableBody.parse(req.body);
            if (!req.user.mfaEnabled) {
                return reply.code(409).send({ error: 'not_enabled' });
            }
            const user = await confirm(req, reply, body);
            if (!user) return;
            await mfa.clear(user.id);
            await audit(db, { userId: user.id, action: 'mfa.disable' });
            return { ok: true };
        });

        app.post('/mfa/recovery-codes', limit, async (req, reply) => {
            if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
            if (!config.secretsKey) return refuseUnavailable(reply);
            const body = renewBody.parse(req.body);
            if (!req.user.mfaEnabled) {
                return reply.code(409).send({ error: 'not_enabled' });
            }
            const user = await confirm(req, reply, {
                password: body.password,
                code: body.code,
            });
            if (!user) return;
            const recoveryCodes = await mfa.renewRecoveryCodes(user.id);
            await audit(db, { userId: user.id, action: 'mfa.recovery_renew' });
            return { recoveryCodes };
        });

        /**
         * The signed-in user's password, counted against the account's
         * lockout when wrong. Answers the request itself on failure and
         * returns null; otherwise the user.
         */
        async function checkPassword(
            req: FastifyRequest,
            reply: FastifyReply,
            password: string
        ) {
            const userId = req.user!.id;
            // not the `mfa:` key that guards signing in: whoever holds a stolen
            // session could otherwise lock the owner out of their own sign-in by
            // guessing passwords here (change-password counts under this key too)
            const key = `password:${userId}`;
            if (locked(reply, key)) return null;
            const [user] = await db.select().from(users).where(eq(users.id, userId));
            if (!(await verifyPassword(user.passwordHash, password))) {
                failures.recordFailure(key);
                // not a sign-in: the person is already signed in
                await audit(db, { userId, action: 'user.password_check_failed' });
                reply.code(403).send({ error: 'wrong_password' });
                return null;
            }
            failures.reset(key);
            return user;
        }

        /**
         * The password and a second factor, both counted against the account's
         * lockout when wrong. Answers the request itself on failure and
         * returns null; otherwise the user.
         */
        async function confirm(
            req: FastifyRequest,
            reply: FastifyReply,
            body: { password: string; code?: string; recoveryCode?: string }
        ) {
            const userId = req.user!.id;
            const key = `mfa:${userId}`;
            const user = await checkPassword(req, reply, body.password);
            if (!user) return null;
            const used = await checkFactor(userId, body);
            if (!used) {
                failures.recordFailure(key);
                await audit(db, { userId, action: 'mfa.failed' });
                reply.code(403).send({ error: 'invalid_code' });
                return null;
            }
            if (used === 'recovery') {
                await audit(db, { userId, action: 'mfa.recovery_used' });
            }
            failures.reset(key);
            return user;
        }
    };
