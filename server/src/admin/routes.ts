import { and, count, eq, ilike, ne, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { activityQuery, listActivity } from '../audit/activity.js';
import { audit, type AuditMeta } from '../audit/audit.js';
import { hashPassword } from '../auth/password.js';
import { destroyOtherSessions } from '../auth/sessions.js';
import type { Db } from '../db/client.js';
import {
    containsPattern,
    offsetOf,
    pageOf,
    pagingQuery,
} from '../lib/paging.js';
import { slugFor } from '../projects/slug.js';
import {
    diagrams,
    projectMembers,
    projects,
    sessions,
    users,
} from '../db/schema.js';

const idParam = z.object({ id: z.string().uuid() });
const memberParam = z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
});

const createUserBody = z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(200),
    isAdmin: z.boolean().default(false),
});

const updateUserBody = z
    .object({
        password: z.string().min(8).max(200).optional(),
        isAdmin: z.boolean().optional(),
        isActive: z.boolean().optional(),
    })
    .refine(
        (b) =>
            b.password !== undefined ||
            b.isAdmin !== undefined ||
            b.isActive !== undefined,
        { message: 'nothing to update' }
    );

const userListQuery = z.object({
    status: z.enum(['active', 'disabled']).optional(),
});

const projectBody = z.object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).default(''),
});

const projectPatchBody = z
    .object({
        name: z.string().trim().min(1).max(100).optional(),
        description: z.string().trim().max(500).optional(),
    })
    .refine((b) => b.name !== undefined || b.description !== undefined, {
        message: 'nothing to update',
    });

const roleBody = z.object({ role: z.enum(['editor', 'viewer']) });

/** Same number on every call: all changes to who is an admin queue behind it. */
export const ADMIN_SET_LOCK = 748_201;

/**
 * Runs `fn` in a transaction that holds the admin-set lock until it commits,
 * so "is there another admin left?" cannot be answered by one request while
 * another is removing that admin.
 */
const withAdminSetLock = <T>(db: Db, fn: (tx: Tx) => Promise<T>) =>
    db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_SET_LOCK})`);
        return fn(tx);
    });

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const otherActiveAdmins = async (tx: Tx, exceptId: string) => {
    const [{ value }] = await tx
        .select({ value: count() })
        .from(users)
        .where(
            and(
                eq(users.isAdmin, true),
                eq(users.isActive, true),
                ne(users.id, exceptId)
            )
        );
    return value;
};

/** Everything under /admin is admin-only; non-admins get a 404, not a 403. */
export const adminRoutes =
    (db: Db): FastifyPluginAsync =>
    async (app) => {
        app.addHook('preHandler', async (req, reply) => {
            if (!req.user) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
            if (!req.user.isAdmin) {
                return reply.code(404).send({ error: 'not_found' });
            }
        });

        // ---- audit log ----

        // newest first, a page at a time: ?limit=&cursor= (the nextCursor of the
        // previous page), filtered with ?group=&action=&userId=&diagramId=&from=&to=&saves=
        app.get('/audit', async (req) =>
            listActivity(db, activityQuery.parse(req.query))
        );

        // ---- users ----

        // paged and searchable: ?page=1&limit=10&q=ann (q matches the email)
        app.get('/users', async (req) => {
            const paging = pagingQuery.parse(req.query);
            const { status } = userListQuery.parse(req.query);
            const where = and(
                paging.q
                    ? ilike(users.email, containsPattern(paging.q))
                    : undefined,
                status ? eq(users.isActive, status === 'active') : undefined
            );
            const [{ value: total }] = await db
                .select({ value: count() })
                .from(users)
                .where(where);
            const items = await db
                .select({
                    id: users.id,
                    email: users.email,
                    isAdmin: users.isAdmin,
                    isActive: users.isActive,
                    createdAt: users.createdAt,
                    projects: sql<number>`(select count(*)::int from project_members pm where pm.user_id = users.id)`,
                })
                .from(users)
                .where(where)
                .orderBy(users.createdAt, users.id)
                .limit(paging.limit)
                .offset(offsetOf(paging));
            return pageOf(items, total, paging);
        });

        app.post('/users', async (req, reply) => {
            const body = createUserBody.parse(req.body);
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
                    isAdmin: body.isAdmin,
                })
                .returning();
            await audit(db, {
                userId: req.user!.id,
                action: 'user.create',
                meta: { targetUserId: user.id },
            });
            return reply.code(201).send({
                id: user.id,
                email: user.email,
                isAdmin: user.isAdmin,
                isActive: user.isActive,
                createdAt: user.createdAt,
                projects: 0,
            });
        });

        app.patch('/users/:id', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const body = updateUserBody.parse(req.body);
            if (body.isActive === false && id === req.user!.id) {
                return reply.code(400).send({ error: 'cannot_disable_self' });
            }
            const patch: Partial<typeof users.$inferInsert> = {};
            if (body.isAdmin !== undefined) patch.isAdmin = body.isAdmin;
            if (body.isActive !== undefined) patch.isActive = body.isActive;
            if (body.password !== undefined) {
                patch.passwordHash = await hashPassword(body.password);
            }
            // the check and the write happen under one lock, so two admins
            // demoting each other at once cannot leave nobody
            const outcome = await withAdminSetLock(db, async (tx) => {
                const [target] = await tx
                    .select()
                    .from(users)
                    .where(eq(users.id, id));
                if (!target) return { error: 'not_found' as const };
                // there must always be an admin who can still sign in
                const losesAdminAccess =
                    target.isAdmin &&
                    target.isActive &&
                    (body.isAdmin === false || body.isActive === false);
                if (losesAdminAccess && (await otherActiveAdmins(tx, id)) < 1) {
                    return { error: 'last_admin' as const };
                }
                await tx.update(users).set(patch).where(eq(users.id, id));
                return { target };
            });
            if ('error' in outcome) {
                return outcome.error === 'not_found'
                    ? reply.code(404).send({ error: 'not_found' })
                    : reply.code(400).send({ error: 'last_admin' });
            }
            const { target } = outcome;
            if (body.password !== undefined || body.isActive === false) {
                // a reset password, or a disabled account, ends every session
                await destroyOtherSessions(db, id, undefined);
            }
            const statusChanged =
                body.isActive !== undefined && body.isActive !== target.isActive;
            // what this request actually changed (a password counts every time)
            const changed: NonNullable<AuditMeta['changed']> = [];
            if (body.password !== undefined) changed.push('password');
            if (body.isAdmin !== undefined && body.isAdmin !== target.isAdmin) {
                changed.push('isAdmin');
            }
            if (statusChanged) changed.push('isActive');
            await audit(db, {
                userId: req.user!.id,
                action: statusChanged
                    ? body.isActive
                        ? 'user.enable'
                        : 'user.disable'
                    : 'user.update',
                meta: { targetUserId: id, changed },
            });
            return {
                id,
                isAdmin: body.isAdmin ?? target.isAdmin,
                isActive: body.isActive ?? target.isActive,
            };
        });

        app.delete('/users/:id', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            if (id === req.user!.id) {
                return reply.code(400).send({ error: 'cannot_delete_self' });
            }
            const outcome = await withAdminSetLock(db, async (tx) => {
                const [target] = await tx
                    .select()
                    .from(users)
                    .where(eq(users.id, id));
                if (!target) return { error: 'not_found' as const };
                // two admins deleting each other at once must not leave nobody
                if (
                    target.isAdmin &&
                    target.isActive &&
                    (await otherActiveAdmins(tx, id)) < 1
                ) {
                    return { error: 'last_admin' as const };
                }
                // owner_id cascades; keep the team's diagrams alive
                await tx
                    .update(diagrams)
                    .set({ ownerId: req.user!.id })
                    .where(eq(diagrams.ownerId, id));
                await tx.delete(sessions).where(eq(sessions.userId, id));
                await tx.delete(users).where(eq(users.id, id));
                return {};
            });
            if (outcome.error === 'not_found') {
                return reply.code(404).send({ error: 'not_found' });
            }
            if (outcome.error === 'last_admin') {
                return reply.code(400).send({ error: 'last_admin' });
            }
            await audit(db, {
                userId: req.user!.id,
                action: 'user.delete',
                meta: { targetUserId: id },
            });
            return reply.code(204).send();
        });

        // ---- projects ----

        // paged and searchable: q matches the project's name or web address
        app.get('/projects', async (req) => {
            const paging = pagingQuery.parse(req.query);
            const where = paging.q
                ? or(
                      ilike(projects.name, containsPattern(paging.q)),
                      ilike(projects.slug, containsPattern(paging.q))
                  )
                : undefined;
            const [{ value: total }] = await db
                .select({ value: count() })
                .from(projects)
                .where(where);
            const items = await db
                .select({
                    id: projects.id,
                    name: projects.name,
                    slug: projects.slug,
                    description: projects.description,
                    createdAt: projects.createdAt,
                    // table names are explicit: in a one-table select Drizzle prints
                    // bare column names, which would resolve to the inner table
                    members: sql<number>`(select count(*)::int from project_members pm where pm.project_id = projects.id)`,
                    diagrams: sql<number>`(select count(*)::int from diagrams d where d.project_id = projects.id)`,
                })
                .from(projects)
                .where(where)
                .orderBy(projects.name, projects.id)
                .limit(paging.limit)
                .offset(offsetOf(paging));
            return pageOf(items, total, paging);
        });

        app.post('/projects', async (req, reply) => {
            const body = projectBody.parse(req.body);
            // the name also becomes the project's URL (/Name/diagrams)
            const check = slugFor(body.name);
            if (!check.ok) return reply.code(400).send({ error: check.error });
            const taken = await db
                .select({ id: projects.id })
                .from(projects)
                .where(
                    or(
                        eq(projects.name, body.name),
                        sql`lower(${projects.slug}) = ${check.slug.toLowerCase()}`
                    )
                );
            if (taken.length > 0) {
                return reply.code(409).send({ error: 'name_taken' });
            }
            const [p] = await db
                .insert(projects)
                .values({ ...body, slug: check.slug, createdBy: req.user!.id })
                .returning();
            await audit(db, {
                userId: req.user!.id,
                action: 'project.create',
                meta: { projectId: p.id, name: p.name },
            });
            return reply.code(201).send({ ...p, members: 0, diagrams: 0 });
        });

        app.patch('/projects/:id', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const body = projectPatchBody.parse(req.body);
            let slug: string | undefined;
            if (body.name !== undefined) {
                const check = slugFor(body.name);
                if (!check.ok) {
                    return reply.code(400).send({ error: check.error });
                }
                slug = check.slug;
                const clash = await db
                    .select({ id: projects.id })
                    .from(projects)
                    .where(
                        and(
                            ne(projects.id, id),
                            or(
                                eq(projects.name, body.name),
                                sql`lower(${projects.slug}) = ${check.slug.toLowerCase()}`
                            )
                        )
                    );
                if (clash.length > 0) {
                    return reply.code(409).send({ error: 'name_taken' });
                }
            }
            const [p] = await db
                .update(projects)
                .set(slug ? { ...body, slug } : body)
                .where(eq(projects.id, id))
                .returning();
            if (!p) return reply.code(404).send({ error: 'not_found' });
            await audit(db, {
                userId: req.user!.id,
                action: 'project.update',
                meta: { projectId: id, name: p.name },
            });
            return p;
        });

        app.delete('/projects/:id', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const [exists] = await db
                .select({ id: projects.id, name: projects.name })
                .from(projects)
                .where(eq(projects.id, id));
            if (!exists) return reply.code(404).send({ error: 'not_found' });
            const [{ value: inside }] = await db
                .select({ value: count() })
                .from(diagrams)
                .where(eq(diagrams.projectId, id));
            if (inside > 0) {
                return reply.code(409).send({ error: 'project_not_empty' });
            }
            await db.delete(projects).where(eq(projects.id, id));
            await audit(db, {
                userId: req.user!.id,
                action: 'project.delete',
                // the project is gone, so keep its name for the log
                meta: { projectId: id, name: exists.name },
            });
            return reply.code(204).send();
        });

        // ---- project membership: assign users and grant permission ----

        app.get('/projects/:id/members', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const [exists] = await db
                .select({ id: projects.id })
                .from(projects)
                .where(eq(projects.id, id));
            if (!exists) return reply.code(404).send({ error: 'not_found' });
            return db
                .select({
                    userId: users.id,
                    email: users.email,
                    role: projectMembers.role,
                })
                .from(projectMembers)
                .innerJoin(users, eq(users.id, projectMembers.userId))
                .where(eq(projectMembers.projectId, id))
                .orderBy(users.email);
        });

        // assign a user, or change their role if already assigned
        app.put('/projects/:id/members/:userId', async (req, reply) => {
            const { id, userId } = memberParam.parse(req.params);
            const body = roleBody.parse(req.body);
            const [project] = await db
                .select({ id: projects.id })
                .from(projects)
                .where(eq(projects.id, id));
            const [user] = await db
                .select({ id: users.id, email: users.email })
                .from(users)
                .where(eq(users.id, userId));
            if (!project || !user) {
                return reply.code(404).send({ error: 'not_found' });
            }
            await db
                .insert(projectMembers)
                .values({ projectId: id, userId, role: body.role })
                .onConflictDoUpdate({
                    target: [projectMembers.projectId, projectMembers.userId],
                    set: { role: body.role },
                });
            await audit(db, {
                userId: req.user!.id,
                action: 'project.member_set',
                meta: { projectId: id, targetUserId: userId, role: body.role },
            });
            return { userId, email: user.email, role: body.role };
        });

        app.delete('/projects/:id/members/:userId', async (req, reply) => {
            const { id, userId } = memberParam.parse(req.params);
            const removed = await db
                .delete(projectMembers)
                .where(
                    and(
                        eq(projectMembers.projectId, id),
                        eq(projectMembers.userId, userId)
                    )
                )
                .returning({ userId: projectMembers.userId });
            if (removed.length === 0) {
                return reply.code(404).send({ error: 'not_found' });
            }
            await audit(db, {
                userId: req.user!.id,
                action: 'project.member_remove',
                meta: { projectId: id, targetUserId: userId },
            });
            return reply.code(204).send();
        });
    };
