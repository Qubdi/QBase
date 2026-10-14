import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit/audit.js';
import type { Db } from '../db/client.js';
import { comments, diagrams, users } from '../db/schema.js';
import { canWrite, getRole } from '../diagrams/permissions.js';
import { latestSnapshot } from '../diagrams/service.js';
import { targetExists, type CommentTargetType } from './targets.js';

const diagramParam = z.object({ id: z.string().uuid() });
const commentParam = z.object({
    id: z.string().uuid(),
    commentId: z.string().uuid(),
});

const text = z.string().trim().min(1).max(2000);
const createBody = z.object({
    targetType: z.enum(['table', 'field', 'relationship']),
    targetId: z.string().min(1).max(200),
    body: text,
});
const updateBody = z.object({ body: text });
const resolveBody = z
    .object({ resolved: z.boolean().default(true) })
    .default({});

type CommentRow = typeof comments.$inferSelect;

/** What the editor sees. */
const presentForEditor = (c: CommentRow, authorEmail: string | null) => ({
    id: c.id,
    targetType: c.targetType,
    targetId: c.targetId,
    body: c.body,
    resolved: c.resolved,
    orphaned: c.orphaned,
    snapshotVersion: c.snapshotVersion,
    authorEmail,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
});

/** What viewers see: no author identity, no orphaned comments. */
export const presentForViewer = (c: CommentRow) => ({
    id: c.id,
    targetType: c.targetType,
    targetId: c.targetId,
    body: c.body,
    resolved: c.resolved,
    createdAt: c.createdAt,
});

/**
 * Comments visible on the latest published snapshot: carried to that version,
 * not orphaned, and attached to something that exists in it.
 */
export async function commentsForPublishedView(db: Db, diagramId: string) {
    const snap = await latestSnapshot(db, diagramId);
    if (!snap) return { version: null, comments: [] };
    const rows = await db
        .select()
        .from(comments)
        .where(
            and(
                eq(comments.diagramId, diagramId),
                eq(comments.snapshotVersion, snap.version),
                eq(comments.orphaned, false)
            )
        )
        .orderBy(asc(comments.createdAt));
    return {
        version: snap.version,
        comments: rows
            .filter((c) =>
                targetExists(snap.content, c.targetType, c.targetId)
            )
            .map(presentForViewer),
    };
}

export const commentRoutes =
    (db: Db): FastifyPluginAsync =>
    async (app) => {
        app.addHook('preHandler', async (req, reply) => {
            if (!req.user) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
        });

        const requireWriter = async (
            diagramId: string,
            userId: string,
            reply: FastifyReply
        ) => {
            const role = await getRole(db, diagramId, userId);
            if (!role) {
                reply.code(404).send({ error: 'not_found' });
                return false;
            }
            if (!canWrite(role)) {
                reply.code(403).send({ error: 'forbidden' });
                return false;
            }
            return true;
        };

        const find = async (diagramId: string, commentId: string) => {
            const [c] = await db
                .select()
                .from(comments)
                .where(
                    and(
                        eq(comments.id, commentId),
                        eq(comments.diagramId, diagramId)
                    )
                );
            return c;
        };

        app.get('/:id/comments', async (req, reply) => {
            const { id } = diagramParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            if (!canWrite(role)) {
                // viewers get the same read-only view a share link gives
                return (await commentsForPublishedView(db, id)).comments;
            }
            const rows = await db
                .select({ c: comments, authorEmail: users.email })
                .from(comments)
                .leftJoin(users, eq(users.id, comments.authorId))
                .where(eq(comments.diagramId, id))
                .orderBy(asc(comments.createdAt));
            return rows.map((r) => presentForEditor(r.c, r.authorEmail));
        });

        app.post('/:id/comments', async (req, reply) => {
            const { id } = diagramParam.parse(req.params);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            const input = createBody.parse(req.body);
            const [d] = await db
                .select()
                .from(diagrams)
                .where(eq(diagrams.id, id));
            if (
                !targetExists(
                    d.content,
                    input.targetType as CommentTargetType,
                    input.targetId
                )
            ) {
                return reply.code(400).send({ error: 'target_not_found' });
            }
            const snap = await latestSnapshot(db, id);
            const [row] = await db
                .insert(comments)
                .values({
                    diagramId: id,
                    snapshotVersion: snap?.version ?? 0,
                    targetType: input.targetType,
                    targetId: input.targetId,
                    body: input.body,
                    authorId: req.user!.id,
                })
                .returning();
            await audit(db, {
                userId: req.user!.id,
                action: 'comment.create',
                diagramId: id,
            });
            return reply
                .code(201)
                .send(presentForEditor(row, req.user!.email));
        });

        app.put('/:id/comments/:commentId', async (req, reply) => {
            const { id, commentId } = commentParam.parse(req.params);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            if (!(await find(id, commentId))) {
                return reply.code(404).send({ error: 'not_found' });
            }
            const input = updateBody.parse(req.body);
            const [row] = await db
                .update(comments)
                .set({ body: input.body, updatedAt: new Date() })
                .where(eq(comments.id, commentId))
                .returning();
            await audit(db, {
                userId: req.user!.id,
                action: 'comment.update',
                diagramId: id,
            });
            return presentForEditor(row, null);
        });

        app.post('/:id/comments/:commentId/resolve', async (req, reply) => {
            const { id, commentId } = commentParam.parse(req.params);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            if (!(await find(id, commentId))) {
                return reply.code(404).send({ error: 'not_found' });
            }
            const input = resolveBody.parse(req.body ?? {});
            const [row] = await db
                .update(comments)
                .set({ resolved: input.resolved, updatedAt: new Date() })
                .where(eq(comments.id, commentId))
                .returning();
            await audit(db, {
                userId: req.user!.id,
                action: 'comment.resolve',
                diagramId: id,
            });
            return presentForEditor(row, null);
        });

        app.delete('/:id/comments/:commentId', async (req, reply) => {
            const { id, commentId } = commentParam.parse(req.params);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            if (!(await find(id, commentId))) {
                return reply.code(404).send({ error: 'not_found' });
            }
            await db.delete(comments).where(eq(comments.id, commentId));
            await audit(db, {
                userId: req.user!.id,
                action: 'comment.delete',
                diagramId: id,
            });
            return reply.code(204).send();
        });
    };
