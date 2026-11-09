import { MAX_UNPAGED_ROWS } from '../lib/limits.js';
import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit, auditDiagramSave } from '../audit/audit.js';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { diagrams, projectMembers, shareLinks, snapshots, users } from '../db/schema.js';
import { emitLinkChanged } from '../events.js';
import { acquireLock, releaseLock } from './lock.js';
import { canWrite, getProjectRole, getRole } from './permissions.js';
import { statsColumns } from './summary.js';
import {
    AUTO_PUBLISH_NOTE,
    latestSnapshotListing,
    presentDiagram,
    presentPublishStatus,
    presentSaved,
    publishSnapshot,
} from './service.js';
import { exceedsDepth } from '../lib/depth.js';
import { diagramHash } from '../lib/hash.js';
import { isForeignKeyViolation } from '../lib/pg-errors.js';
import { pgDate } from '../lib/pg-date.js';

/**
 * A list not narrowed to one project is cut to this many diagrams unless the
 * caller asks for another page size: it would read, sort and send every
 * diagram there is. One project's list is bounded by the project.
 */
const DEFAULT_LIST_LIMIT = 100;
/** Deepest page the diagram list will skip to; narrow the list with `projectId` to go further. */
const MAX_LIST_OFFSET = 10_000;
/** Most versions the version list returns for one diagram, newest first. */
export const MAX_LISTED_VERSIONS = 500;
const idParam = z.object({ id: z.string().uuid() });
const listQuery = z.object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
    /** deep pages scan and discard every row before them, so the depth is bounded */
    offset: z.coerce.number().int().min(0).max(MAX_LIST_OFFSET).default(0),
    /** only this project's diagrams */
    projectId: z.string().uuid().optional(),
});
/** Names one open editor (a browser tab) for the diagram's edit lock. */
const editorIdSchema = z.string().min(1).max(100);
const versionParam = z.object({
    id: z.string().uuid(),
    version: z.coerce.number().int().positive().max(2147483647),
});

/** The deepest nesting a saved diagram may have. */
const MAX_CONTENT_DEPTH = 100;

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
    .passthrough()
    // a real diagram nests a handful of levels; far deeper is an attempt to
    // overflow the recursive hash, so it is refused as a bad request
    .refine((content) => !exceedsDepth(content, MAX_CONTENT_DEPTH), {
        message: `content nests deeper than ${MAX_CONTENT_DEPTH} levels`,
    });

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
        baseUpdatedAt: pgDate().optional(),
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
    (db: Db, config: Pick<Config, 'diagramBodyLimit' | 'snapshotKeep' | 'auditSaveMinutes' | 'autoPublishCoalesceSeconds'>): FastifyPluginAsync =>
    async (app) => {
        app.addHook('preHandler', async (req, reply) => {
            if (!req.user) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
        });

        /**
         * What the list shows for the diagrams the caller may see, newest first;
         * one diagram when `id` is given. The database orders and cuts the
         * list, so a page never reads the rest.
         */
        const listFor = async (
            me: NonNullable<FastifyRequest['user']>,
            opts: {
                id?: string;
                projectId?: string;
                limit?: number;
                offset: number;
            }
        ) => {
            const select = {
                id: diagrams.id,
                title: diagrams.title,
                updatedAt: diagrams.updatedAt,
                ownerId: diagrams.ownerId,
                ownerEmail: users.email,
                projectId: diagrams.projectId,
                ...statsColumns,
            };
            const order = [desc(diagrams.updatedAt), diagrams.id];
            const viewerOrder = desc(sql`case when ${projectMembers.role} = 'viewer'
                then coalesce(
                    (select ${snapshots.publishedAt} from ${snapshots}
                     where ${snapshots.diagramId} = ${diagrams.id}
                     order by ${snapshots.version} desc limit 1),
                    ${diagrams.updatedAt})
                else ${diagrams.updatedAt} end`);
            // A viewer sees published copies only: a diagram with nothing
            // published is not listed for them, so its working title and the
            // time of its last edit stay with the people who can write it.
            const publishedForViewers = sql`(${projectMembers.role} <> 'viewer'
                or exists (select 1 from ${snapshots}
                           where ${snapshots.diagramId} = ${diagrams.id}))`;
            const only = and(
                opts.id ? eq(diagrams.id, opts.id) : undefined,
                opts.projectId
                    ? eq(diagrams.projectId, opts.projectId)
                    : undefined
            );
            // admins see every project's diagrams; others only their projects'
            const rows = me.isAdmin
                ? (
                      await db
                          .select(select)
                          .from(diagrams)
                          .leftJoin(users, eq(users.id, diagrams.ownerId))
                          .where(only)
                          .orderBy(...order)
                          .limit(opts.limit ?? MAX_UNPAGED_ROWS)
                          .offset(opts.offset)
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
                      .where(
                          and(
                              eq(projectMembers.userId, me.id),
                              only,
                              publishedForViewers
                          )
                      )
                      // a viewer sees the published time (below), so the list is
                      // ordered by that, not by the working copy's own edits
                      .orderBy(viewerOrder, diagrams.id)
                      .limit(opts.limit ?? MAX_UNPAGED_ROWS)
                      .offset(opts.offset);
            // viewers must not learn about unpublished renames
            const latest = await latestSnapshotListing(
                db,
                rows.filter((r) => !canWrite(r.role)).map((r) => r.id)
            );
            return rows.flatMap((r) => {
                if (canWrite(r.role)) return [r];
                const last = latest.get(r.id);
                // the query lists only published diagrams for viewers; one
                // whose snapshots went since is left out, never shown as it is
                if (!last) return [];
                return [
                    {
                        ...r,
                        title: last.title,
                        updatedAt: last.publishedAt,
                        // who owns the working copy is for people who can edit it
                        ownerEmail: null,
                        // the numbers describe what the viewer can open: the published copy
                        databaseType: last.databaseType,
                        databaseEdition: last.databaseEdition,
                        tableCount: last.tableCount,
                        relationshipCount: last.relationshipCount,
                        createdAt: last.createdAt,
                    },
                ];
            });
        };

        app.get('/', async (req) => {
            // paging is optional for one project's list: without `limit` all of
            // it comes back. A list of everything is cut to a default page.
            const { limit, offset, projectId } = listQuery.parse(req.query);
            return listFor(req.user!, {
                limit: limit ?? (projectId ? undefined : DEFAULT_LIST_LIMIT),
                offset,
                projectId,
            });
        });

        // One row of the list, without the content: how the editor learns its
        // role in a diagram without reading every diagram the user can see.
        app.get('/:id/summary', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const [row] = await listFor(req.user!, { id, offset: 0 });
            if (!row) {
                // a viewer of a diagram with nothing published learns only that
                const role = await getRole(db, id, req.user!.id);
                return reply
                    .code(404)
                    .send({ error: role ? 'not_published' : 'not_found' });
            }
            return row;
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
            // the project can be deleted between the check and the insert
            let diagram;
            try {
                // everything but the content: the response reuses the content
                // that was just sent instead of reading it back
                const { content: _content, ...columns } =
                    getTableColumns(diagrams);
                const [row] = await db
                    .insert(diagrams)
                    .values({
                        ownerId: userId,
                        projectId: body.projectId,
                        title: body.title,
                        content: body.content,
                        contentHash: diagramHash(body.title, body.content),
                    })
                    .returning(columns);
                diagram = { ...row, content: body.content };
            } catch (err) {
                if (isForeignKeyViolation(err)) {
                    return reply.code(404).send({ error: 'not_found' });
                }
                throw err;
            }
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

        // the lock row points at the diagram: one deleted since the role check
        // makes the insert fail on its foreign key, which is a 404, not a 500
        const acquireLockIfThere = async (
            id: string,
            userId: string,
            editorId: string
        ) => {
            try {
                return await acquireLock(db, id, userId, editorId);
            } catch (err) {
                if (isForeignKeyViolation(err)) return null;
                throw err;
            }
        };

        // the publish badge's own read: no content, so refreshing it after
        // every save does not download the diagram
        app.get('/:id/publish-status', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            if (!canWrite(role)) return reply.code(403).send({ error: 'forbidden' });
            const [d] = await db
                .select({
                    id: diagrams.id,
                    title: diagrams.title,
                    contentHash: diagrams.contentHash,
                    autoPublish: diagrams.autoPublish,
                })
                .from(diagrams)
                .where(eq(diagrams.id, id));
            if (!d) return reply.code(404).send({ error: 'not_found' });
            return presentPublishStatus(db, d);
        });

        app.get('/:id', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            const [d] = await db
                .select()
                .from(diagrams)
                .where(eq(diagrams.id, id));
            // deleted since the role check above
            if (!d) return reply.code(404).send({ error: 'not_found' });
            const shown = await presentDiagram(db, d, role);
            // nothing published: a viewer sees neither the working title nor its edit time
            if (!canWrite(role) && shown.publishedVersion === null) {
                return reply.code(404).send({ error: 'not_published' });
            }
            return shown;
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
            const lock = await acquireLockIfThere(
                id,
                req.user!.id,
                editorId ?? `api:${req.user!.id}`
            );
            if (!lock) return reply.code(404).send({ error: 'not_found' });
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
            // The hash of what is saved, worked out here once so no read has to.
            // A rename alone leaves it empty: the content is not in hand, and
            // the next read fills it in.
            let contentHash: string | null | undefined;
            if (changes.content !== undefined) {
                const title =
                    changes.title ??
                    (
                        await db
                            .select({ title: diagrams.title })
                            .from(diagrams)
                            .where(eq(diagrams.id, id))
                    )[0]?.title;
                contentHash =
                    title === undefined
                        ? null
                        : diagramHash(title, changes.content);
            } else if (changes.title !== undefined) {
                contentHash = null;
            }
            const [d] = await db
                .update(diagrams)
                .set({
                    ...changes,
                    ...(contentHash !== undefined ? { contentHash } : {}),
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(diagrams.id, id),
                        changes.content !== undefined && baseUpdatedAt
                            ? sql`date_trunc('milliseconds', ${diagrams.updatedAt}) = ${baseUpdatedAt}`
                            : undefined
                    )
                )
                // not the content: the editor has it, and it is not read back
                .returning({
                    id: diagrams.id,
                    ownerId: diagrams.ownerId,
                    projectId: diagrams.projectId,
                    title: diagrams.title,
                    updatedAt: diagrams.updatedAt,
                    autoPublish: diagrams.autoPublish,
                    contentHash: diagrams.contentHash,
                });
            if (!d) {
                // the diagram exists (checked above), so the base was stale
                const [current] = await db
                    .select({ updatedAt: diagrams.updatedAt })
                    .from(diagrams)
                    .where(eq(diagrams.id, id));
                // not stale, gone: deleted since the role check above
                if (!current) return reply.code(404).send({ error: 'not_found' });
                return reply.code(409).send({
                    error: 'conflict',
                    message:
                        'Someone else saved this diagram after the copy you started from.',
                    updatedAt: current.updatedAt,
                });
            }
            await auditDiagramSave(
                db,
                { userId: req.user!.id, diagramId: id },
                config.auditSaveMinutes
            );
            if (d.autoPublish) {
                const snap = await publishSnapshot(db, id, req.user!.id, {
                    note: AUTO_PUBLISH_NOTE,
                    auto: true,
                    onlyIfChanged: true,
                    keep: config.snapshotKeep,
                    coalesceSeconds: config.autoPublishCoalesceSeconds,
                });
                // a rewrite of the last auto snapshot is the same version again
                if (snap && !snap.coalesced) {
                    await audit(db, {
                        userId: req.user!.id,
                        action: 'diagram.publish',
                        diagramId: id,
                        meta: { version: snap.version },
                    });
                }
            }
            return presentSaved(db, d, role);
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
            const lock = await acquireLockIfThere(id, req.user!.id, editorId);
            if (!lock) return reply.code(404).send({ error: 'not_found' });
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
            // its links die with it: tell their open live streams to look again
            const links = await db
                .select({ id: shareLinks.id })
                .from(shareLinks)
                .where(eq(shareLinks.diagramId, id));
            // the delete and its log row together: no diagram is gone unrecorded
            await db.transaction(async (tx) => {
                await tx.delete(diagrams).where(eq(diagrams.id, id));
                await audit(tx, {
                    userId: req.user!.id,
                    action: 'diagram.delete',
                    diagramId: id,
                    meta: { projectId: gone?.projectId, name: gone?.title },
                });
            });
            for (const link of links) emitLinkChanged(link.id);
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
            const rows = await db
                .select({
                    version: snapshots.version,
                    note: snapshots.note,
                    publishedAt: snapshots.publishedAt,
                    publishedBy: users.email,
                })
                .from(snapshots)
                .leftJoin(users, eq(users.id, snapshots.publishedBy))
                .where(eq(snapshots.diagramId, id))
                .orderBy(desc(snapshots.version))
                // SNAPSHOT_KEEP=0 keeps every version, so the list is bounded here
                .limit(MAX_LISTED_VERSIONS);
            // who published is for people who can edit; a viewer sees the versions
            return canWrite(role) ? rows : rows.map((r) => ({ ...r, publishedBy: null }));
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
