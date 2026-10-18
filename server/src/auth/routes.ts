import { count, eq, sql } from 'drizzle-orm';
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
import { createFailureThrottle } from '../lib/failure-throttle.js';
import { isUniqueViolation } from '../lib/pg-errors.js';
import {
    hashPassword,
    verifyAgainstNobody,
    verifyPassword,
} from './password.js';
import { createMfa, mfaAvailable } from './mfa.js';
import { mfaRoutes } from './mfa-routes.js';
import { weakPassword } from './password-rules.js';
import {
    createSession,
    destroyOtherSessions,
    destroySession,
    SESSION_COOKIE,
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
});

const changePassword = z.object({
    currentPassword: z.string(),
    newPassword: z.string().max(200),
    // with two-factor on, changing the password needs a code (or a recovery code)
    code: z.string().max(20).optional(),
    recoveryCode: z.string().max(40).optional(),
});

export const authRoutes =
    (db: Db, config: Config): FastifyPluginAsync =>
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
        const failures = createFailureThrottle({
            max: config.authMaxFailures,
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

        const cookieSecure = (req: FastifyRequest) =>
            config.cookieSecure === 'auto'
                ? req.protocol === 'https'
                : config.cookieSecure;

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
            reply.setCookie(SESSION_COOKIE, token, {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: cookieSecure(req),
                expires: expiresAt,
            });
        };

        const mfa = createMfa(db, config);

        // lets the UI show the first-run "create admin" form only when it applies
        app.get('/setup-status', async () => {
            const [{ value }] = await db.select({ value: count() }).from(users);
            // the form needs the minimum length to tick its checklist as people type
            return {
                needsSetup: value === 0,
                passwordMinLength: config.passwordMinLength,
                // whether the account menu offers two-factor at all
                mfaAvailable: mfaAvailable(config),
            };
        });

        if (config.mfaEnabled) {
            await app.register(
                mfaRoutes({ db, config, mfa, failures, locked, limit, startSession })
            );
        }

        app.post('/register', limit, async (req, reply) => {
            const body = newAccount.parse(req.body);
            const weak = weakPassword(config, body.password, body.email);
            if (weak) return reply.code(400).send(weak);
            const passwordHash = await hashPassword(body.password);
            // Counting and inserting happen under one lock: two first-run
            // sign-ups arriving together would both see an empty table and
            // both become admin.
            const result = await db.transaction(async (tx) => {
                await tx.execute(
                    sql`select pg_advisory_xact_lock(${FIRST_USER_LOCK})`
                );
                const [{ value: existing }] = await tx
                    .select({ value: count() })
                    .from(users);
                // accounts are created by an admin; only the very first one may self-register
                if (existing > 0) return { error: 'signup_disabled' as const };
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
            // unknown emails are counted too, so the lockout reveals nothing
            const key = `login:${body.email}`;
            if (locked(reply, key)) return;
            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.email, body.email));
            const ok = user
                ? await verifyPassword(user.passwordHash, body.password)
                : await verifyAgainstNobody(body.password);
            if (!user || !ok) {
                failures.recordFailure(key);
                // only for an account that exists: guesses at made-up emails
                // would otherwise fill the log
                if (user) {
                    await audit(db, {
                        userId: user.id,
                        action: 'user.sign_in_failed',
                    });
                }
                return reply.code(401).send({ error: 'invalid_credentials' });
            }
            failures.reset(key);
            if (!user.isActive) {
                return reply.code(403).send({ error: 'account_disabled' });
            }
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

        app.post('/logout', async (req, reply) => {
            await destroySession(db, req.cookies[SESSION_COOKIE]);
            reply.clearCookie(SESSION_COOKIE, {
                path: '/',
                secure: cookieSecure(req),
            });
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
            if (locked(reply, key)) return;
            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.id, req.user.id));
            if (
                !(await verifyPassword(user.passwordHash, body.currentPassword))
            ) {
                failures.recordFailure(key);
                await audit(db, {
                    userId: user.id,
                    action: 'user.sign_in_failed',
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
                const mfaKey = `mfa:${user.id}`;
                if (locked(reply, mfaKey)) return;
                const ok =
                    body.code !== undefined
                        ? await mfa.checkCode(user.id, body.code)
                        : await mfa.spendRecoveryCode(user.id, body.recoveryCode!);
                if (!ok) {
                    failures.recordFailure(mfaKey);
                    await audit(db, { userId: user.id, action: 'mfa.failed' });
                    return reply.code(403).send({ error: 'invalid_code' });
                }
                failures.reset(mfaKey);
                if (body.code === undefined) {
                    await audit(db, { userId: user.id, action: 'mfa.recovery_used' });
                }
            }
            failures.reset(key);
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
                req.cookies[SESSION_COOKIE]
            );
            await audit(db, { userId: user.id, action: 'user.password_change' });
            return { ok: true };
        });
    };
