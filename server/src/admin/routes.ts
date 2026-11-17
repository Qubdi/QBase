import { MAX_UNPAGED_ROWS } from '../lib/limits.js';
import {
    and,
    asc,
    count,
    desc,
    eq,
    gt,
    ilike,
    inArray,
    isNull,
    ne,
    notInArray,
    or,
    sql,
} from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
    adminDiagramsQuery,
    listAdminDiagrams,
    listDiagramLinks,
} from './diagrams.js';
import { adminStats, statsQuery } from './stats.js';
import { activityQuery, listActivity } from '../audit/activity.js';
import { exportActivityCsv, exportFilters, exportQuery } from '../audit/export.js';
import {
    audit,
    auditMany,
    type AuditAction,
    type AuditMeta,
} from '../audit/audit.js';
import { hashPassword } from '../auth/password.js';
import { createAuthGuards, type AuthGuards } from '../auth/guards.js';
import { createMfa } from '../auth/mfa.js';
import { createStepUp, stepUpFields } from '../auth/step-up.js';
import { weakPassword } from '../auth/password-rules.js';
import type { Config } from '../config.js';
import { isForeignKeyViolation, isUniqueViolation } from '../lib/pg-errors.js';
import { destroyOtherSessions } from '../auth/sessions.js';
import type { Db, Tx } from '../db/client.js';
import { emitLinkChanged } from '../events.js';
import {
    containsPattern,
    MAX_PAGE_SIZE,
    offsetOf,
    pageOf,
    pagingQuery,
} from '../lib/paging.js';
import { slugFor } from '../projects/slug.js';
import {
    diagramLocks,
    diagrams,
    projectMembers,
    projects,
    sessions,
    shareLinks,
    users,
} from '../db/schema.js';

const PROJECT_SORTS = ['name_asc', 'name_desc', 'created_desc', 'created_asc'] as const;
const projectSortQuery = z.object({ sort: z.enum(PROJECT_SORTS).default('name_asc') });

/** The ORDER BY of the project list; the id keeps rows with the same value in a fixed order across pages. */
const projectOrder = (sort: (typeof PROJECT_SORTS)[number]) => {
    switch (sort) {
        case 'name_desc':
            return [desc(projects.name), desc(projects.id)] as const;
        case 'created_desc':
            return [desc(projects.createdAt), desc(projects.id)] as const;
        case 'created_asc':
            return [asc(projects.createdAt), asc(projects.id)] as const;
        default:
            return [asc(projects.name), asc(projects.id)] as const;
    }
};

const idParam = z.object({ id: z.string().uuid() });
const linkParam = z.object({
    id: z.string().uuid(),
    linkId: z.string().uuid(),
});
const memberParam = z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
});

const createUserBody = z.object({
    email: z.string().trim().toLowerCase().email(),
    // the rules are checked in the route (weakPassword), so the answer can list them
    password: z.string().max(200),
    isAdmin: z.boolean().default(false),
});

const updateUserBody = z
    .object({
        password: z.string().max(200).optional(),
        isAdmin: z.boolean().optional(),
        isActive: z.boolean().optional(),
        // proof for resetting another admin's password (see createStepUp)
        ...stepUpFields,
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

/** One action on up to a page's worth of accounts at once. */
const bulkUsersBody = z.object({
    action: z.enum(['enable', 'disable', 'delete']),
    ids: z.array(z.string().uuid()).min(1).max(MAX_PAGE_SIZE),
});

const BULK_AUDIT_ACTION = {
    enable: 'user.enable',
    disable: 'user.disable',
    delete: 'user.delete',
} as const satisfies Record<
    z.infer<typeof bulkUsersBody>['action'],
    AuditAction
>;

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

/**
 * Revokes the live share links the accounts made, and returns their ids so the
 * caller can tell the viewers once the change is committed. A link outlives
 * the account's sessions otherwise: it keeps serving a diagram for someone
 * the admin has just cut off.
 */
const revokeLinksOf = async (tx: Tx, userIds: string[]): Promise<string[]> => {
    const revoked = await tx
        .update(shareLinks)
        .set({ revokedAt: new Date(), tokenEnc: null })
        .where(
            and(inArray(shareLinks.createdBy, userIds), isNull(shareLinks.revokedAt))
        )
        .returning({ id: shareLinks.id });
    return revoked.map((r) => r.id);
};

/**
 * Deletes accounts. Their diagrams do not go with them (owner_id would
 * cascade): the team keeps them, owned by `heirId`.
 */
const removeUsers = async (
    tx: Tx,
    ids: string[],
    heirId: string
): Promise<string[]> => {
    // Lock the accounts first. A diagram the user creates while this runs
    // inserts a row that points at the user, which waits for this lock, and
    // then the reassignment below sees it; without the lock it would appear
    // after the reassignment and be cascade-deleted with the account. Ordered,
    // so two deletions of overlapping sets cannot lock in opposite orders.
    await tx
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, ids))
        .orderBy(users.id)
        .for('update');
    await tx
        .update(diagrams)
        .set({ ownerId: heirId })
        .where(inArray(diagrams.ownerId, ids));
    // before the delete: the links' created_by is cleared with the account
    const revokedLinks = await revokeLinksOf(tx, ids);
    await tx.delete(sessions).where(inArray(sessions.userId, ids));
    await tx.delete(users).where(inArray(users.id, ids));
    return revokedLinks;
};

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
    (
        db: Db,
        config: Pick<
            Config,
            | 'passwordMinLength'
            | 'mfaEnabled'
            | 'secretsKey'
            | 'mfaWindowSteps'
            | 'authMaxFailures'
            | 'authLockoutMinutes'
        >,
        // the failure counters of sign-in and the account screens: a wrong
        // password here counts against the same lockout
        guards: AuthGuards = createAuthGuards(config)
    ): FastifyPluginAsync =>
    async (app) => {
        const stepMfa = config.mfaEnabled ? createMfa(db, config) : null;
        const stepUp = createStepUp({ db, config, mfa: stepMfa, guards });
        app.addHook('preHandler', async (req, reply) => {
            if (!req.user) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
            if (!req.user.isAdmin) {
                return reply.code(404).send({ error: 'not_found' });
            }
        });

        // ---- overview ----

        // the figures on the Overview; ?tz=Asia/Tbilisi makes a "day" the viewer's own
        app.get('/stats', async (req) =>
            adminStats(db, statsQuery.parse(req.query).tz)
        );

        // ---- audit log ----

        // newest first, a page at a time: ?limit=&cursor= (the nextCursor of the
        // previous page), filtered with ?group=&action=&userId=&diagramId=&from=&to=&saves=
        app.get('/audit', async (req) =>
            listActivity(db, activityQuery.parse(req.query))
        );

        // the same filters as the list, as a CSV file (newest first, at most
        // EXPORT_MAX_ROWS rows). An admin taking a copy of who did what is
        // itself logged.
        app.get('/audit/export', async (req, reply) => {
            const filters = exportQuery.parse(req.query);
            const { csv, rows, truncated } = await exportActivityCsv(
                db,
                filters
            );
            const used = exportFilters(filters);
            await audit(db, {
                userId: req.user!.id,
                action: 'audit.export',
                meta: {
                    rows,
                    ...(Object.keys(used).length > 0 ? { filters: used } : {}),
                },
            });
            const day = new Date().toISOString().slice(0, 10);
            return reply
                .header('content-type', 'text/csv; charset=utf-8')
                .header(
                    'content-disposition',
                    `attachment; filename="qbase-activity-${day}.csv"`
                )
                .header('cache-control', 'no-store')
                .header('x-row-count', String(rows))
                .header('x-truncated', String(truncated))
                .send(csv);
        });

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
                    lastLoginAt: users.lastLoginAt,
                    mfaEnabled: sql<boolean>`${users.mfaEnabledAt} is not null`,
                    projects: sql<number>`(select count(*)::int from project_members pm where pm.user_id = users.id)`,
                })
                .from(users)
                .where(where)
                .orderBy(users.createdAt, users.id)
                .limit(paging.limit)
                .offset(offsetOf(paging));
            // who is signed in right now, for this page only: one lookup on
            // sessions_user_idx, not a join that every row pays for
            const live =
                items.length === 0
                    ? []
                    : await db
                          .select({
                              userId: sessions.userId,
                              lastSeenAt: sessions.lastSeenAt,
                          })
                          .from(sessions)
                          .where(
                              and(
                                  inArray(
                                      sessions.userId,
                                      items.map((u) => u.id)
                                  ),
                                  gt(sessions.expiresAt, new Date())
                              )
                          );
            const lastActive = new Map<string, Date>();
            for (const s of live) {
                const known = lastActive.get(s.userId);
                if (!known || s.lastSeenAt > known) {
                    lastActive.set(s.userId, s.lastSeenAt);
                }
            }
            return pageOf(
                items.map((u) => ({
                    ...u,
                    // null: not signed in (no live session)
                    lastActiveAt: lastActive.get(u.id) ?? null,
                })),
                total,
                paging
            );
        });

        app.post('/users', async (req, reply) => {
            const body = createUserBody.parse(req.body);
            const weak = weakPassword(config, body.password, body.email);
            if (weak) return reply.code(400).send(weak);
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
                    .values({
                        email: body.email,
                        passwordHash,
                        // the password is the admin's choice, so the person
                        // picks their own at first sign-in
                        mustChangePassword: true,
                        isAdmin: body.isAdmin,
                    })
                    .returning();
            } catch (err) {
                // two requests passed the check above: the constraint decides
                if (isUniqueViolation(err)) {
                    return reply.code(409).send({ error: 'email_taken' });
                }
                throw err;
            }
            await audit(db, {
                userId: req.user!.id,
                action: 'user.create',
                // whether the new account can administer: the one fact in this row
                // that matters when the log is read after something went wrong
                meta: { targetUserId: user.id, isAdmin: user.isAdmin },
            });
            return reply.code(201).send({
                id: user.id,
                email: user.email,
                isAdmin: user.isAdmin,
                isActive: user.isActive,
                createdAt: user.createdAt,
                lastLoginAt: null,
                lastActiveAt: null,
                projects: 0,
            });
        });

        app.patch('/users/:id', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const body = updateUserBody.parse(req.body);
            if (body.isActive === false && id === req.user!.id) {
                return reply.code(400).send({ error: 'cannot_disable_self' });
            }
            // An admin's own password changes only through /auth/change-password,
            // which asks for the current password (and the 2FA code). Here a
            // stolen admin session could set a new one with nothing else.
            if (body.password !== undefined && id === req.user!.id) {
                return reply.code(400).send({ error: 'use_change_password' });
            }
            const patch: Partial<typeof users.$inferInsert> = {};
            if (body.isAdmin !== undefined) patch.isAdmin = body.isAdmin;
            if (body.isActive !== undefined) patch.isActive = body.isActive;
            if (body.password !== undefined) {
                // the rules compare with the account's own email
                const [account] = await db
                    .select({ email: users.email, isAdmin: users.isAdmin })
                    .from(users)
                    .where(eq(users.id, id));
                if (!account)
                    return reply.code(404).send({ error: 'not_found' });
                // taking over another admin's account needs this admin's own
                // password (and code): a stolen session alone must not do it
                if (account.isAdmin && !(await stepUp(req, reply, body))) {
                    return;
                }
                const weak = weakPassword(config, body.password, account.email);
                if (weak) return reply.code(400).send(weak);
                patch.passwordHash = await hashPassword(body.password);
                // a reset is a temporary password: its owner chooses their own
                patch.mustChangePassword = true;
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
                const revokedLinks =
                    body.isActive === false && target.isActive
                        ? await revokeLinksOf(tx, [id])
                        : [];
                // a reset password, or a disabled account, ends every session: in
                // the same transaction, so the change never stands without it
                if (body.password !== undefined || body.isActive === false) {
                    await destroyOtherSessions(tx, id, undefined);
                }
                return { target, revokedLinks };
            });
            if ('error' in outcome) {
                return outcome.error === 'not_found'
                    ? reply.code(404).send({ error: 'not_found' })
                    : reply.code(400).send({ error: 'last_admin' });
            }
            const { target, revokedLinks } = outcome;
            revokedLinks.forEach(emitLinkChanged);
            const statusChanged =
                body.isActive !== undefined &&
                body.isActive !== target.isActive;
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
                meta: {
                    targetUserId: id,
                    changed,
                    ...(changed.includes('isAdmin')
                        ? { isAdmin: body.isAdmin }
                        : {}),
                },
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
                const revokedLinks = await removeUsers(tx, [id], req.user!.id);
                // in the same transaction: no account is gone without its row
                await audit(tx, {
                    userId: req.user!.id,
                    action: 'user.delete',
                    meta: { targetUserId: id },
                });
                return { revokedLinks };
            });
            if (outcome.error === 'not_found') {
                return reply.code(404).send({ error: 'not_found' });
            }
            if (outcome.error === 'last_admin') {
                return reply.code(400).send({ error: 'last_admin' });
            }
            outcome.revokedLinks?.forEach(emitLinkChanged);
            return reply.code(204).send();
        });

        // Enable, disable or delete several accounts in one request. All or
        // nothing, under the same lock as the single-account routes: a request
        // that would leave no admin who can sign in, or that includes the
        // caller in a disable or delete, changes nothing and says why. An
        // account that is already in the wanted state, or no longer exists,
        // is counted as unchanged and gets no audit row.
        app.post('/users/bulk', async (req, reply) => {
            const body = bulkUsersBody.parse(req.body);
            const ids = [...new Set(body.ids)];
            const self = req.user!.id;
            // enabling yourself changes nothing, so only the actions that take
            // access away refuse
            if (body.action !== 'enable' && ids.includes(self)) {
                return reply.code(400).send({
                    error:
                        body.action === 'delete'
                            ? 'cannot_delete_self'
                            : 'cannot_disable_self',
                });
            }
            const outcome = await withAdminSetLock(db, async (tx) => {
                const found = await tx
                    .select({
                        id: users.id,
                        isAdmin: users.isAdmin,
                        isActive: users.isActive,
                    })
                    .from(users)
                    .where(inArray(users.id, ids));
                const changing = found.filter((u) =>
                    body.action === 'enable'
                        ? !u.isActive
                        : body.action === 'disable'
                          ? u.isActive
                          : true
                );
                const changingIds = changing.map((u) => u.id);
                if (changingIds.length === 0)
                    return { changed: [] as string[], revokedLinks: [] as string[] };

                // admins who can sign in are lost to a disable or a delete;
                // someone else must remain
                const losesAdmin =
                    body.action !== 'enable' &&
                    changing.some((u) => u.isAdmin && u.isActive);
                if (losesAdmin) {
                    const [{ value: remaining }] = await tx
                        .select({ value: count() })
                        .from(users)
                        .where(
                            and(
                                eq(users.isAdmin, true),
                                eq(users.isActive, true),
                                notInArray(users.id, changingIds)
                            )
                        );
                    if (remaining < 1) return { error: 'last_admin' as const };
                }

                let revokedLinks: string[] = [];
                if (body.action === 'enable') {
                    await tx
                        .update(users)
                        .set({ isActive: true })
                        .where(inArray(users.id, changingIds));
                } else if (body.action === 'disable') {
                    await tx
                        .update(users)
                        .set({ isActive: false })
                        .where(inArray(users.id, changingIds));
                    // a disabled account ends every session, and lets go of
                    // the diagrams it was editing
                    await tx
                        .delete(sessions)
                        .where(inArray(sessions.userId, changingIds));
                    await tx
                        .delete(diagramLocks)
                        .where(inArray(diagramLocks.userId, changingIds));
                    revokedLinks = await revokeLinksOf(tx, changingIds);
                } else {
                    revokedLinks = await removeUsers(tx, changingIds, self);
                }
                // in the same transaction: no account changes without its rows
                await auditMany(
                    tx,
                    changingIds.map((targetUserId) => ({
                        userId: self,
                        action: BULK_AUDIT_ACTION[body.action],
                        meta: { targetUserId },
                    }))
                );
                return { changed: changingIds, revokedLinks };
            });
            if ('error' in outcome) {
                return reply.code(400).send({ error: outcome.error });
            }
            outcome.revokedLinks.forEach(emitLinkChanged);
            return {
                changed: outcome.changed.length,
                unchanged: ids.length - outcome.changed.length,
            };
        });

        // ---- a user's two-factor sign-in ----

        // The lost-phone fallback after the recovery codes: clears the secret
        // and the codes and signs that person out everywhere. Not for yourself:
        // turning your own off needs your password and a code (account menu).
        if (config.mfaEnabled) {
            const mfa = createMfa(db, config);
            app.post('/users/:id/mfa/reset', async (req, reply) => {
                const { id } = idParam.parse(req.params);
                const proof = z.object(stepUpFields).partial().parse(req.body ?? {});
                if (id === req.user!.id) {
                    return reply.code(400).send({ error: 'cannot_reset_self' });
                }
                const [target] = await db
                    .select({
                        enabledAt: users.mfaEnabledAt,
                        isAdmin: users.isAdmin,
                    })
                    .from(users)
                    .where(eq(users.id, id));
                if (!target) return reply.code(404).send({ error: 'not_found' });
                // nothing to reset is not an event
                if (target.enabledAt === null) return { reset: false };
                // clearing another admin's second factor needs this admin's own
                // password (and code), so a stolen session cannot strip it
                if (target.isAdmin && !(await stepUp(req, reply, proof))) return;
                await mfa.clear(id);
                await destroyOtherSessions(db, id, undefined);
                await audit(db, {
                    userId: req.user!.id,
                    action: 'mfa.reset',
                    meta: { targetUserId: id },
                });
                return { reset: true };
            });
        }

        // ---- a user's sessions ----

        // what the admin may see of a session: when, and from which browser.
        // Never its id, which is the hash of the cookie.
        app.get('/users/:id/sessions', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const [exists] = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.id, id));
            if (!exists) return reply.code(404).send({ error: 'not_found' });
            return db
                .select({
                    createdAt: sessions.createdAt,
                    lastSeenAt: sessions.lastSeenAt,
                    expiresAt: sessions.expiresAt,
                    userAgent: sessions.userAgent,
                })
                .from(sessions)
                .where(
                    and(
                        eq(sessions.userId, id),
                        gt(sessions.expiresAt, new Date())
                    )
                )
                .orderBy(desc(sessions.createdAt));
        });

        // "sign out everywhere". Your own session is the one you use: leave
        // with the ordinary sign out.
        app.delete('/users/:id/sessions', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            if (id === req.user!.id) {
                return reply.code(400).send({ error: 'cannot_sign_out_self' });
            }
            const [exists] = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.id, id));
            if (!exists) return reply.code(404).send({ error: 'not_found' });
            const signedOut = await destroyOtherSessions(db, id, undefined);
            // signing out someone who was not signed in is not an event
            if (signedOut > 0) {
                await audit(db, {
                    userId: req.user!.id,
                    action: 'user.sign_out',
                    meta: { targetUserId: id },
                });
            }
            return { signedOut };
        });

        // ---- diagrams and their share links ----

        // paged: ?page=&limit=&q= (matches the title) &projectId=
        app.get('/diagrams', async (req) =>
            listAdminDiagrams(db, adminDiagramsQuery.parse(req.query))
        );

        app.get('/diagrams/:id/share-links', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const [exists] = await db
                .select({ id: diagrams.id })
                .from(diagrams)
                .where(eq(diagrams.id, id));
            if (!exists) return reply.code(404).send({ error: 'not_found' });
            return listDiagramLinks(db, id);
        });

        // Ends a link at once, including for anyone watching it live. An admin
        // does not have to be a member of the project to do this: a leaked
        // link is exactly when the owner may not be around.
        app.delete('/diagrams/:id/share-links/:linkId', async (req, reply) => {
            const { id, linkId } = linkParam.parse(req.params);
            const [link] = await db
                .select({
                    id: shareLinks.id,
                    access: shareLinks.access,
                    createdAt: shareLinks.createdAt,
                })
                .from(shareLinks)
                .where(
                    and(eq(shareLinks.id, linkId), eq(shareLinks.diagramId, id))
                );
            if (!link) return reply.code(404).send({ error: 'not_found' });
            // only the request that really revokes it records it: two admins
            // revoking at once leave one row
            const revoked = await db
                .update(shareLinks)
                .set({ revokedAt: new Date(), tokenEnc: null })
                .where(
                    and(eq(shareLinks.id, linkId), isNull(shareLinks.revokedAt))
                )
                .returning({ id: shareLinks.id });
            // cut the viewers off first: a log row that fails must not leave them connected
            emitLinkChanged(linkId);
            if (revoked.length > 0) {
                await audit(db, {
                    userId: req.user!.id,
                    action: 'share.revoke',
                    diagramId: id,
                    meta: {
                        linkId,
                        access: link.access,
                        madeAt: link.createdAt.toISOString(),
                    },
                });
            }
            return reply.code(204).send();
        });

        // ---- projects ----

        // paged, searchable and sortable: q matches the project's name or web
        // address; sort is the name (default) or the creation date, either way round
        app.get('/projects', async (req) => {
            const paging = pagingQuery.parse(req.query);
            const { sort } = projectSortQuery.parse(req.query);
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
                .orderBy(...projectOrder(sort))
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
            let p;
            try {
                [p] = await db
                    .insert(projects)
                    .values({
                        ...body,
                        slug: check.slug,
                        createdBy: req.user!.id,
                    })
                    .returning();
            } catch (err) {
                if (isUniqueViolation(err)) {
                    return reply.code(409).send({ error: 'name_taken' });
                }
                throw err;
            }
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
            let p;
            try {
                [p] = await db
                    .update(projects)
                    .set(slug ? { ...body, slug } : body)
                    .where(eq(projects.id, id))
                    .returning();
            } catch (err) {
                if (isUniqueViolation(err)) {
                    return reply.code(409).send({ error: 'name_taken' });
                }
                throw err;
            }
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
            // Everything inside goes with the project: diagrams, and through the
            // foreign keys their locks, snapshots, share links and drift data, plus
            // memberships and saved connections. One transaction: all or nothing.
            const removed = await db.transaction(async (tx) => {
                const gone = await tx
                    .delete(diagrams)
                    .where(eq(diagrams.projectId, id))
                    .returning({ id: diagrams.id });
                await tx.delete(projects).where(eq(projects.id, id));
                return gone.length;
            });
            await audit(db, {
                userId: req.user!.id,
                action: 'project.delete',
                // the project is gone, so keep its name for the log
                meta: { projectId: id, name: exists.name, diagrams: removed },
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
                .orderBy(users.email)
                .limit(MAX_UNPAGED_ROWS);
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
            // the project or the user can be deleted between the check and
            // the insert
            try {
                await db
                    .insert(projectMembers)
                    .values({ projectId: id, userId, role: body.role })
                    .onConflictDoUpdate({
                        target: [
                            projectMembers.projectId,
                            projectMembers.userId,
                        ],
                        set: { role: body.role },
                    });
            } catch (err) {
                if (isForeignKeyViolation(err)) {
                    return reply.code(404).send({ error: 'not_found' });
                }
                throw err;
            }
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
