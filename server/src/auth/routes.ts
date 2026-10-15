import { count, eq } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit/audit.js';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
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
        const startSession = async (reply: FastifyReply, userId: string) => {
            const { token, expiresAt } = await createSession(
                db,
                userId,
                config.sessionDays
            );
            reply.setCookie(SESSION_COOKIE, token, {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                expires: expiresAt,
            });
        };

        // lets the UI show the first-run "create admin" form only when it applies
        app.get('/setup-status', async () => {
            const [{ value }] = await db.select({ value: count() }).from(users);
            return { needsSetup: value === 0 };
        });

        app.post('/register', async (req, reply) => {
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
            const [user] = await db
                .insert(users)
                .values({
                    email: body.email,
                    passwordHash: await hashPassword(body.password),
                    isAdmin: isFirst,
                })
                .returning();
            await audit(db, { userId: user.id, action: 'user.register' });
            await startSession(reply, user.id);
            return reply.code(201).send({
                id: user.id,
                email: user.email,
                isAdmin: user.isAdmin,
            });
        });

        app.post('/login', async (req, reply) => {
            const body = credentials.parse(req.body);
            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.email, body.email));
            if (
                !user ||
                !(await verifyPassword(user.passwordHash, body.password))
            ) {
                return reply.code(401).send({ error: 'invalid_credentials' });
            }
            if (!user.isActive) {
                return reply.code(403).send({ error: 'account_disabled' });
            }
            await startSession(reply, user.id);
            return { id: user.id, email: user.email, isAdmin: user.isAdmin };
        });

        app.post('/logout', async (req, reply) => {
            await destroySession(db, req.cookies[SESSION_COOKIE]);
            reply.clearCookie(SESSION_COOKIE, { path: '/' });
            return { ok: true };
        });

        app.get('/me', async (req, reply) => {
            if (!req.user) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
            return req.user;
        });

        app.post('/change-password', async (req, reply) => {
            if (!req.user) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
            const body = changePassword.parse(req.body);
            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.id, req.user.id));
            if (
                !(await verifyPassword(user.passwordHash, body.currentPassword))
            ) {
                return reply.code(403).send({ error: 'wrong_password' });
            }
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
