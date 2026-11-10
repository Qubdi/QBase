import { createHash, timingSafeEqual } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type {
    FastifyPluginAsync,
    FastifyReply,
    FastifyRequest,
} from 'fastify';
import { z } from 'zod';
import { audit } from '../audit/audit.js';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
import { isUniqueViolation } from '../lib/pg-errors.js';
import {
    hashPassword,
    verifyAgainstNobody,
    verifyPassword,
} from './password.js';
import { addressKey } from '../lib/rate-key.js';
import { createAuthGuards, type AuthGuards } from './guards.js';
import { createMfa, mfaAvailable } from './mfa.js';
import { mfaRoutes } from './mfa-routes.js';
import { weakPassword } from './password-rules.js';
import {
    createSession,
    destroyOtherSessions,
    destroySession,
    SESSION_COOKIE,
    SECURE_SESSION_COOKIE,
    sessionTokenOf,
    isSecureRequest,
} from './sessions.js';

// advisory-lock key for the first-run sign-up (distinct from the admin-set lock)
const FIRST_USER_LOCK = 7_301_001;

// Sign-in only checks that something was sent: the rules for a good password
// apply when one is SET (see weakPassword), never here, so people who chose a
// password under older rules can still get in.
const signIn = z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1).max(200),
});

const newAccount = z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().max(200),
    // only read by the first-run sign-up, and only when the server asks for one
    setupToken: z.string().max(256).optional(),
});

/** Constant-time comparison: both sides are hashed first, so length does not leak either. */
const sameToken = (given: string | undefined, expected: string) =>
    timingSafeEqual(
        createHash('sha256').update(given ?? '').digest(),
        createHash('sha256').update(expected).digest()
    );

const changePassword = z.object({
    // as long as any password the server accepts: a hash of megabytes is a cheap attack
    currentPassword: z.string().max(200),
    newPassword: z.string().max(200),
    // with two-factor on, changing the password needs a code (or a recovery code)
    code: z.string().max(20).optional(),
    recoveryCode: z.string().max(40).optional(),
});

export const authRoutes =
    (
        db: Db,
        config: Config,
        // shared with the admin step-up, so a lockout holds at every door
        guards: AuthGuards = createAuthGuards(config)
    ): FastifyPluginAsync =>
    async (app) => {
        // per client address; an account's failures are counted separately
        // below, so one account cannot be guessed at from many addresses
        const limit = {
            config: {
                rateLimit: {
                    max: config.authRateLimit,
                    timeWindow: '1 minute',
                },
            },
        };
        const { failures, accountFailures, locked, mfaGuard } = guards;

        const cookieSecure = (req: FastifyRequest) =>
            isSecureRequest(req, config.cookieSecure);

        const startSession = async (
            req: FastifyRequest,
            reply: FastifyReply,
            userId: string
        ) => {
            const { token, expiresAt } = await createSession(
                db,
                userId,
                config.sessionDays,
                req.headers['user-agent']
            );
            const secure = cookieSecure(req);
            // over https the cookie takes the `__Host-` name (a browser only
            // keeps that one when it is Secure, Path=/ and has no Domain);
            // over plain http it cannot, so it keeps the plain name
            reply.setCookie(secure ? SECURE_SESSION_COOKIE : SESSION_COOKIE, token, {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure,
                expires: expiresAt,
            });
            // a plain-named cookie from before the prefix would otherwise sit
            // beside the new one for the rest of its life
            if (secure) reply.clearCookie(SESSION_COOKIE, { path: '/', secure });
        };

        const mfa = createMfa(db, config);

        // lets the UI show the first-run "create admin" form only when it applies
        app.get('/setup-status', limit, async () => {
            // one row is enough to know; counting would visit every user
            const anyUser = await db
                .select({ id: users.id })
                .from(users)
                .limit(1);
            // the form needs the minimum length to tick its checklist as people type
            return {
                needsSetup: anyUser.length === 0,
                // the form shows its token field only while it is needed; the token itself is never sent
                setupTokenRequired: anyUser.length === 0 && config.setupToken !== null,
                passwordMinLength: config.passwordMinLength,
                // whether the account menu offers two-factor at all
                mfaAvailable: mfaAvailable(config),
            };
        });

        if (config.mfaEnabled) {
            await app.register(
                mfaRoutes({ db, config, mfa, failures, locked, mfaGuard, limit, startSession })
            );
        }

        app.post('/register', limit, async (req, reply) => {
            const body = newAccount.parse(req.body);
            const weak = weakPassword(config, body.password, body.email);
            if (weak) return reply.code(400).send(weak);
            // Once sign-up is closed, say so before the (slow) hash: otherwise anyone
            // can make the server spend a hash per request. The count inside the
            // transaction below is the one that decides; this only saves work.
            // (one row is enough to know; counting would visit every user)
            const anyUser = await db
                .select({ id: users.id })
                .from(users)
                .limit(1);
            if (anyUser.length > 0) {
                return reply.code(403).send({ error: 'signup_disabled' });
            }
            // While the server is empty, only whoever read the token in its log
            // (or set SETUP_TOKEN) may create the admin. Checked before the slow hash.
            if (config.setupToken !== null && !sameToken(body.setupToken, config.setupToken)) {
                return reply.code(403).send({ error: 'invalid_setup_token' });
            }
            const passwordHash = await hashPassword(body.password);
            // Counting and inserting happen under one lock: two first-run
            // sign-ups arriving together would both see an empty table and
            // both become admin.
            const result = await db.transaction(async (tx) => {
                await tx.execute(
                    sql`select pg_advisory_xact_lock(${FIRST_USER_LOCK})`
                );
                const anyUser = await tx
                    .select({ id: users.id })
                    .from(users)
                    .limit(1);
                // accounts are created by an admin; only the very first one may self-register
                if (anyUser.length > 0) return { error: 'signup_disabled' as const };
                const taken = await tx
                    .select({ id: users.id })
                    .from(users)
                    .where(eq(users.email, body.email));
                if (taken.length > 0) return { error: 'email_taken' as const };
                const [created] = await tx
                    .insert(users)
                    .values({ email: body.email, passwordHash, isAdmin: true })
                    .returning();
                return { user: created };
            }).catch((err: unknown) => {
                if (isUniqueViolation(err)) {
                    return { error: 'email_taken' as const };
                }
                throw err;
            });
            if ('error' in result) {
                return reply
                    .code(result.error === 'signup_disabled' ? 403 : 409)
                    .send({ error: result.error });
            }
            const { user } = result;
            await audit(db, { userId: user.id, action: 'user.register' });
            await startSession(req, reply, user.id);
            return reply.code(201).send({
                id: user.id,
                email: user.email,
                isAdmin: user.isAdmin,
                mustChangePassword: false,
                mfaEnabled: false,
            });
        });

        app.post('/login', limit, async (req, reply) => {
            const body = signIn.parse(req.body);
            // Unknown emails are counted too, so the lockout reveals nothing. The
            // address is part of the key: failures from one address lock out that
            // address for that account, so a stranger cannot keep someone else
            // out by guessing at their account on purpose. (Guesses spread over
            // many addresses are held back by the per-address rate limit.)
            const key = `login:${body.email}:${addressKey(req.ip)}`;
            const accountKey = `login:${body.email}`;
            if (await locked(reply, key)) return;
            const accountWait = await accountFailures.blockedFor(accountKey);
            if (accountWait > 0) {
                return reply
                    .code(429)
                    .header('retry-after', accountWait)
                    .send({ error: 'too_many_attempts' });
            }
            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.email, body.email));
            const ok = user
                ? await verifyPassword(user.passwordHash, body.password)
                : await verifyAgainstNobody(body.password);
            // a disabled account is answered like a wrong password, so a correct
            // password cannot confirm that the account exists but is switched off
            if (!user || !user.isActive || !ok) {
                const addressLocked = await failures.recordFailure(key);
                const accountLocked = await accountFailures.recordFailure(accountKey);
                reply.code(401).send({ error: 'invalid_credentials' });
                // The row is written after the answer has gone out, and only for
                // an account that exists (guesses at made-up emails would fill the
                // log): a write that took time before replying would tell a real
                // email from a made-up one by how long the answer took.
                if (user) {
                    try {
                        await audit(db, {
                            userId: user.id,
                            action: 'user.sign_in_failed',
                        });
                        // the failure that tripped a lockout is worth its own row
                        if (addressLocked || accountLocked) {
                            await audit(db, { userId: user.id, action: 'user.locked' });
                        }
                    } catch (err) {
                        req.log.error({ err }, 'sign-in failure was not logged');
                    }
                }
                return reply;
            }
            await failures.reset(key);
            await accountFailures.reset(accountKey);
            // password right, but there is a second step: no cookie yet, only
            // a ticket for POST /auth/login/mfa
            if (config.mfaEnabled && user.mfaEnabledAt) {
                if (!config.secretsKey) {
                    // codes cannot be checked without the key, so fail closed
                    return reply.code(503).send({ error: 'mfa_unavailable' });
                }
                return {
                    mfaRequired: true,
                    challenge: await mfa.createChallenge(user.id),
                };
            }
            await startSession(req, reply, user.id);
            await audit(db, { userId: user.id, action: 'user.sign_in' });
            return {
                id: user.id,
                email: user.email,
                isAdmin: user.isAdmin,
                mustChangePassword: user.mustChangePassword,
                mfaEnabled: false,
            };
        });

        app.post('/logout', limit, async (req, reply) => {
            // a call with no live session signs nobody out, so it leaves no row
            if (req.user) {
                await audit(db, { userId: req.user.id, action: 'user.logout' });
            }
            await destroySession(db, sessionTokenOf(req.cookies, cookieSecure(req)));
            const secure = cookieSecure(req);
            reply.clearCookie(SESSION_COOKIE, { path: '/', secure });
            if (secure) reply.clearCookie(SECURE_SESSION_COOKIE, { path: '/', secure });
            return { ok: true };
        });

        app.get('/me', async (req, reply) => {
            if (!req.user) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
            // the feature switched off server-wide reads as off
            return {
                ...req.user,
                mfaEnabled: config.mfaEnabled && req.user.mfaEnabled,
            };
        });

        app.post('/change-password', limit, async (req, reply) => {
            if (!req.user) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
            const body = changePassword.parse(req.body);
            const key = `password:${req.user.id}`;
            if (await locked(reply, key)) return;
            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.id, req.user.id));
            if (
                !(await verifyPassword(user.passwordHash, body.currentPassword))
            ) {
                await failures.recordFailure(key);
                // a signed-in person mistyping their password is not a sign-in attempt
                await audit(db, {
                    userId: user.id,
                    action: 'user.password_check_failed',
                });
                return reply.code(403).send({ error: 'wrong_password' });
            }
            // the current password was right, so saying why the new one is not
            // acceptable tells a stranger nothing
            if (body.newPassword === body.currentPassword) {
                return reply.code(400).send({ error: 'same_password' });
            }
            const weak = weakPassword(config, body.newPassword, user.email);
            if (weak) return reply.code(400).send(weak);
            // a stolen session alone cannot change the password of an account
            // that has a second factor
            if (config.mfaEnabled && user.mfaEnabledAt) {
                if (body.code === undefined && body.recoveryCode === undefined) {
                    return reply.code(403).send({ error: 'mfa_code_required' });
                }
                if (!config.secretsKey) {
                    return reply.code(503).send({ error: 'mfa_unavailable' });
                }
                if (await mfaGuard.locked(reply, req, user.id)) return;
                const ok =
                    body.code !== undefined
                        ? await mfa.checkCode(user.id, body.code)
                        : await mfa.spendRecoveryCode(user.id, body.recoveryCode!);
                if (!ok) {
                    await mfaGuard.fail(req, user.id);
                    await audit(db, { userId: user.id, action: 'mfa.failed' });
                    return reply.code(403).send({ error: 'invalid_code' });
                }
                await mfaGuard.reset(req, user.id);
                if (body.code === undefined) {
                    await audit(db, { userId: user.id, action: 'mfa.recovery_used' });
                }
            }
            await failures.reset(key);
            await db
                .update(users)
                .set({
                    passwordHash: await hashPassword(body.newPassword),
                    // their own password now, not the temporary one
                    mustChangePassword: false,
                })
                .where(eq(users.id, user.id));
            await destroyOtherSessions(
                db,
                user.id,
                sessionTokenOf(req.cookies, cookieSecure(req))
            );
            await audit(db, { userId: user.id, action: 'user.password_change' });
            return { ok: true };
        });
    };
