import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit/audit.js';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { diagrams, projectMembers, snapshots, users } from '../db/schema.js';
import { acquireLock, releaseLock } from './lock.js';
import { canWrite, getProjectRole, getRole } from './permissions.js';
import { diagramStats, statsColumns } from './summary.js';
import {
    latestSnapshots,
    presentDiagram,
    publishSnapshot,
} from './service.js';

const idParam = z.object({ id: z.string().uuid() });
/** Names one open editor (a browser tab) for the diagram's edit lock. */
const editorIdSchema = z.string().min(1).max(100);
const versionParam = z.object({
    id: z.string().uuid(),
    version: z.coerce.number().int().positive(),
});

/**
 * A diagram's content is the editor's own JSON, so unknown keys pass through.
 * What the server relies on is checked: the known collections are arrays and
 * the known scalars are strings.
 */
const diagramContent = z
    .object({
        id: z.string().max(200).optional(),
        name: z.string().max(500).optional(),
        databaseType: z.string().max(50).optional(),
        databaseEdition: z.string().max(50).optional(),
        tables: z.array(z.unknown()).optional(),
        relationships: z.array(z.unknown()).optional(),
        dependencies: z.array(z.unknown()).optional(),
        areas: z.array(z.unknown()).optional(),
        customTypes: z.array(z.unknown()).optional(),
        notes: z.array(z.unknown()).optional(),
    })
    .passthrough();

const createBody = z.object({
    title: z.string().trim().min(1).max(200),
    content: diagramContent,
    // every diagram lives in a project
    projectId: z.string().uuid(),
});

const updateBody = z
    .object({
        title: z.string().trim().min(1).max(200).optional(),
        content: diagramContent.optional(),
        autoPublish: z.boolean().optional(),
        /**
         * The `updatedAt` of the copy this edit is based on. Saving content
         * needs it, so a save made on top of someone else's newer one is
         * refused instead of silently replacing it.
         */
        baseUpdatedAt: z.coerce.date().optional(),
        /**
         * The editor making the change. Without one the change is taken to be
         * the user's own API call, which holds the lock just for itself.
         */
        editorId: editorIdSchema.optional(),
    })
    .refine(
        (b) =>
            b.title !== undefined ||
            b.content !== undefined ||
            b.autoPublish !== undefined,
        { message: 'nothing to update' }
    )
    .refine((b) => b.content === undefined || b.baseUpdatedAt !== undefined, {
        message: 'baseUpdatedAt is required when saving content',
        path: ['baseUpdatedAt'],
    });

const lockBody = z.object({ editorId: editorIdSchema });

const publishBody = z
    .object({ note: z.string().trim().max(500).optional() })
    .default({});

export const diagramRoutes =
    (db: Db, config: Pick<Config, 'diagramBodyLimit' | 'snapshotKeep'>): FastifyPluginAsync =>
    async (app) => {
        app.addHook('preHandler', async (req, reply) => {
            if (!req.user) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
        });

        app.get('/', async (req) => {
            const me = req.user!;
            const select = {
                id: diagrams.id,
                title: diagrams.title,
                updatedAt: diagrams.updatedAt,
                ownerId: diagrams.ownerId,
                ownerEmail: users.email,
                projectId: diagrams.projectId,
                ...statsColumns,
            };
            // admins see every project's diagrams; others only their projects'
            const rows = me.isAdmin
                ? (
                      await db
                          .select(select)
                          .from(diagrams)
                          .leftJoin(users, eq(users.id, diagrams.ownerId))
                  ).map((d) => ({
                      ...d,
                      role: 'owner' as const,
                  }))
                : await db
                      .select({ ...select, role: projectMembers.role })
                      .from(projectMembers)
                      .innerJoin(
                          diagrams,
                          eq(diagrams.projectId, projectMembers.projectId)
                      )
                      .leftJoin(users, eq(users.id, diagrams.ownerId))
                      .where(eq(projectMembers.userId, me.id));
            rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
            // viewers must not learn about unpublished renames
            const latest = await latestSnapshots(
                db,
                rows.filter((r) => !canWrite(r.role)).map((r) => r.id)
            );
            return rows.map((r) => {
                if (canWrite(r.role)) return r;
                const last = latest.get(r.id);
                return {
                    ...r,
                    title: last?.title ?? r.title,
                    updatedAt: last?.publishedAt ?? r.updatedAt,
                    // the numbers describe what the viewer can open: the published copy
                    // (nothing published yet: nothing to describe)
                    ...diagramStats(last?.content),
                };
            });
        });

        app.post('/', { bodyLimit: config.diagramBodyLimit }, async (req, reply) => {
            const body = createBody.parse(req.body);
            const userId = req.user!.id;
            // creating needs write access in the project; strangers get 404
            const projectRole = await getProjectRole(
                db,
                body.projectId,
                userId
            );
            if (!projectRole) {
                return reply.code(404).send({ error: 'not_found' });
            }
            if (!canWrite(projectRole)) {
                return reply.code(403).send({ error: 'forbidden' });
            }
            const [diagram] = await db
                .insert(diagrams)
                .values({
                    ownerId: userId,
                    projectId: body.projectId,
                    title: body.title,
                    content: body.content,
                })
                .returning();
            await audit(db, {
                userId,
                action: 'diagram.create',
                diagramId: diagram.id,
                meta: { projectId: diagram.projectId, name: diagram.title },
            });
            return reply
                .code(201)
                .send(
                    await presentDiagram(
                        db,
                        diagram,
                        (await getRole(db, diagram.id, userId)) ?? 'owner'
                    )
                );
        });

        app.get('/:id', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            const [d] = await db
                .select()
                .from(diagrams)
                .where(eq(diagrams.id, id));
            return presentDiagram(db, d, role);
        });

        app.put('/:id', { bodyLimit: config.diagramBodyLimit }, async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            if (!canWrite(role)) {
                return reply.code(403).send({ error: 'forbidden' });
            }
            const { baseUpdatedAt, editorId, ...changes } = updateBody.parse(
                req.body
            );
            // one editor at a time: saving needs the lock, and takes it when free
            const lock = await acquireLock(
                db,
                id,
                req.user!.id,
                editorId ?? `api:${req.user!.id}`
            );
            if (!lock.held) {
                return reply.code(423).send({
                    error: 'locked',
                    message: `${lock.holder} is editing this diagram.`,
                    holder: lock.holder,
                });
            }
            // the compare and the write are one statement, so two saves based
            // on the same copy cannot both win. Times are compared to the
            // millisecond: that is all JSON carries.
            const [d] = await db
                .update(diagrams)
                .set({ ...changes, updatedAt: new Date() })
                .where(
                    and(
                        eq(diagrams.id, id),
                        changes.content !== undefined && baseUpdatedAt
                            ? sql`date_trunc('milliseconds', ${diagrams.updatedAt}) = ${baseUpdatedAt}`
                            : undefined
                    )
                )
                .returning();
            if (!d) {
                // the diagram exists (checked above), so the base was stale
                const [current] = await db
                    .select({ updatedAt: diagrams.updatedAt })
                    .from(diagrams)
                    .where(eq(diagrams.id, id));
                return reply.code(409).send({
                    error: 'conflict',
                    message:
                        'Someone else saved this diagram after the copy you started from.',
                    updatedAt: current?.updatedAt ?? null,
                });
            }
            await audit(db, {
                userId: req.user!.id,
                action: 'diagram.update',
                diagramId: id,
            });
            if (d.autoPublish) {
                const snap = await publishSnapshot(db, id, req.user!.id, {
                    note: 'Auto-published on save',
                    onlyIfChanged: true,
                    keep: config.snapshotKeep,
                });
                if (snap) {
                    await audit(db, {
                        userId: req.user!.id,
                        action: 'diagram.publish',
                        diagramId: id,
                        meta: { version: snap.version },
                    });
                }
            }
            // the editor has the content it just sent: do not send it back
            const { content: _sent, ...saved } = await presentDiagram(
                db,
                d,
                role
            );
            return saved;
        });

        // The editor asks for this when it opens the diagram and again every
        // few seconds. `held: false` means someone else is editing: open read-only.
        app.post('/:id/lock', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            if (!canWrite(role)) {
                return reply.code(403).send({ error: 'forbidden' });
            }
            const { editorId } = lockBody.parse(req.body);
            const lock = await acquireLock(db, id, req.user!.id, editorId);
            return lock.held
                ? { held: true }
                : { held: false, holder: lock.holder };
        });

        app.delete('/:id/lock', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const { editorId } = lockBody.parse(req.query);
            await releaseLock(db, id, req.user!.id, editorId);
            return reply.code(204).send();
        });

        app.delete('/:id', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            if (role !== 'owner') {
                return reply.code(403).send({ error: 'forbidden' });
            }
            // the diagram is about to go, so note what it was for the log
            const [gone] = await db
                .select({ title: diagrams.title, projectId: diagrams.projectId })
                .from(diagrams)
                .where(eq(diagrams.id, id));
            await db.delete(diagrams).where(eq(diagrams.id, id));
            await audit(db, {
                userId: req.user!.id,
                action: 'diagram.delete',
                diagramId: id,
                meta: { projectId: gone?.projectId, name: gone?.title },
            });
            return reply.code(204).send();
        });

        app.post('/:id/publish', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            if (!canWrite(role)) {
                return reply.code(403).send({ error: 'forbidden' });
            }
            const { note } = publishBody.parse(req.body ?? {});
            const snap = await publishSnapshot(db, id, req.user!.id, {
                note,
                keep: config.snapshotKeep,
            });
            if (!snap) return reply.code(404).send({ error: 'not_found' });
            await audit(db, {
                userId: req.user!.id,
                action: 'diagram.publish',
                diagramId: id,
                meta: { version: snap.version },
            });
            return reply.code(201).send({
                version: snap.version,
                note: snap.note,
                publishedAt: snap.publishedAt,
            });
        });

        app.get('/:id/versions', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            return db
                .select({
                    version: snapshots.version,
                    note: snapshots.note,
                    publishedAt: snapshots.publishedAt,
                    publishedBy: users.email,
                })
                .from(snapshots)
                .leftJoin(users, eq(users.id, snapshots.publishedBy))
                .where(eq(snapshots.diagramId, id))
                .orderBy(desc(snapshots.version));
        });

        app.get('/:id/versions/:version', async (req, reply) => {
            const { id, version } = versionParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            const [snap] = await db
                .select()
                .from(snapshots)
                .where(
                    and(
                        eq(snapshots.diagramId, id),
                        eq(snapshots.version, version)
                    )
                );
            if (!snap) return reply.code(404).send({ error: 'not_found' });
            return {
                version: snap.version,
                title: snap.title,
                content: snap.content,
                note: snap.note,
                publishedAt: snap.publishedAt,
            };
        });
    };
