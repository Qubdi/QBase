import { count, eq } from 'drizzle-orm';
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
import { hashPassword, verifyPassword } from './password.js';
import {
    createSession,
    destroyOtherSessions,
    destroySession,
    SESSION_COOKIE,
} from './sessions.js';

const credentials = z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(200),
});

const changePassword = z.object({
    currentPassword: z.string(),
    newPassword: z.string().min(8).max(200),
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

        // lets the UI show the first-run "create admin" form only when it applies
        app.get('/setup-status', async () => {
            const [{ value }] = await db.select({ value: count() }).from(users);
            return { needsSetup: value === 0 };
        });

        app.post('/register', limit, async (req, reply) => {
            const body = credentials.parse(req.body);
            const [{ value: existing }] = await db
                .select({ value: count() })
                .from(users);
            const isFirst = existing === 0;
            // accounts are created by an admin; only the very first one may self-register
            if (!isFirst) {
                return reply.code(403).send({ error: 'signup_disabled' });
            }
            const taken = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.email, body.email));
            if (taken.length > 0) {
                return reply.code(409).send({ error: 'email_taken' });
            }
            const passwordHash = await hashPassword(body.password);
            let user;
            try {
                [user] = await db
                    .insert(users)
                    .values({ email: body.email, passwordHash, isAdmin: isFirst })
                    .returning();
            } catch (err) {
                if (isUniqueViolation(err)) {
                    return reply.code(409).send({ error: 'email_taken' });
                }
                throw err;
            }
            await audit(db, { userId: user.id, action: 'user.register' });
            await startSession(req, reply, user.id);
            return reply.code(201).send({
                id: user.id,
                email: user.email,
                isAdmin: user.isAdmin,
            });
        });

        app.post('/login', limit, async (req, reply) => {
            const body = credentials.parse(req.body);
            // unknown emails are counted too, so the lockout reveals nothing
            const key = `login:${body.email}`;
            if (locked(reply, key)) return;
            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.email, body.email));
            if (
                !user ||
                !(await verifyPassword(user.passwordHash, body.password))
            ) {
                failures.recordFailure(key);
                return reply.code(401).send({ error: 'invalid_credentials' });
            }
            failures.reset(key);
            if (!user.isActive) {
                return reply.code(403).send({ error: 'account_disabled' });
            }
            await startSession(req, reply, user.id);
            return { id: user.id, email: user.email, isAdmin: user.isAdmin };
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
            return req.user;
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
                return reply.code(403).send({ error: 'wrong_password' });
            }
            failures.reset(key);
            await db
                .update(users)
                .set({ passwordHash: await hashPassword(body.newPassword) })
                .where(eq(users.id, user.id));
            await destroyOtherSessions(
                db,
                user.id,
                req.cookies[SESSION_COOKIE]
            );
            return { ok: true };
        });
    };
