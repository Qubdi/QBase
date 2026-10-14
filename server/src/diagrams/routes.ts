import { desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit/audit.js';
import type { Db } from '../db/client.js';
import { diagramMembers, diagrams, snapshots, users } from '../db/schema.js';
import { canWrite, getRole } from './permissions.js';
import {
    latestSnapshot,
    presentDiagram,
    publishSnapshot,
} from './service.js';

const idParam = z.object({ id: z.string().uuid() });
const versionParam = z.object({
    id: z.string().uuid(),
    version: z.coerce.number().int().positive(),
});

const createBody = z.object({
    title: z.string().trim().min(1).max(200),
    content: z.record(z.unknown()),
});

const updateBody = z
    .object({
        title: z.string().trim().min(1).max(200).optional(),
        content: z.record(z.unknown()).optional(),
        autoPublish: z.boolean().optional(),
    })
    .refine(
        (b) =>
            b.title !== undefined ||
            b.content !== undefined ||
            b.autoPublish !== undefined,
        { message: 'nothing to update' }
    );

const publishBody = z
    .object({ note: z.string().trim().max(500).optional() })
    .default({});

export const diagramRoutes =
    (db: Db): FastifyPluginAsync =>
    async (app) => {
        app.addHook('preHandler', async (req, reply) => {
            if (!req.user) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
        });

        app.get('/', async (req) => {
            const rows = await db
                .select({
                    id: diagrams.id,
                    title: diagrams.title,
                    updatedAt: diagrams.updatedAt,
                    ownerId: diagrams.ownerId,
                    role: diagramMembers.role,
                })
                .from(diagramMembers)
                .innerJoin(diagrams, eq(diagrams.id, diagramMembers.diagramId))
                .where(eq(diagramMembers.userId, req.user!.id))
                .orderBy(desc(diagrams.updatedAt));
            // viewers must not learn about unpublished renames
            return Promise.all(
                rows.map(async (r) => {
                    if (canWrite(r.role)) return r;
                    const last = await latestSnapshot(db, r.id);
                    return {
                        ...r,
                        title: last?.title ?? r.title,
                        updatedAt: last?.publishedAt ?? r.updatedAt,
                    };
                })
            );
        });

        app.post('/', async (req, reply) => {
            const body = createBody.parse(req.body);
            const userId = req.user!.id;
            const diagram = await db.transaction(async (tx) => {
                const [d] = await tx
                    .insert(diagrams)
                    .values({
                        ownerId: userId,
                        title: body.title,
                        content: body.content,
                    })
                    .returning();
                await tx.insert(diagramMembers).values({
                    diagramId: d.id,
                    userId,
                    role: 'owner',
                });
                return d;
            });
            await audit(db, {
                userId,
                action: 'diagram.create',
                diagramId: diagram.id,
            });
            return reply
                .code(201)
                .send(await presentDiagram(db, diagram, 'owner'));
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

        app.put('/:id', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            if (!canWrite(role)) {
                return reply.code(403).send({ error: 'forbidden' });
            }
            const body = updateBody.parse(req.body);
            const [d] = await db
                .update(diagrams)
                .set({ ...body, updatedAt: new Date() })
                .where(eq(diagrams.id, id))
                .returning();
            await audit(db, {
                userId: req.user!.id,
                action: 'diagram.update',
                diagramId: id,
            });
            if (d.autoPublish) {
                const snap = await publishSnapshot(db, id, req.user!.id, {
                    note: 'Auto-published on save',
                    onlyIfChanged: true,
                });
                if (snap) {
                    await audit(db, {
                        userId: req.user!.id,
                        action: 'diagram.publish',
                        diagramId: id,
                    });
                }
            }
            return presentDiagram(db, d, role);
        });

        app.delete('/:id', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            if (role !== 'owner') {
                return reply.code(403).send({ error: 'forbidden' });
            }
            await db.delete(diagrams).where(eq(diagrams.id, id));
            await audit(db, {
                userId: req.user!.id,
                action: 'diagram.delete',
                diagramId: id,
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
            const snap = await publishSnapshot(db, id, req.user!.id, { note });
            if (!snap) return reply.code(404).send({ error: 'not_found' });
            await audit(db, {
                userId: req.user!.id,
                action: 'diagram.publish',
                diagramId: id,
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
            const rows = await db
                .select()
                .from(snapshots)
                .where(eq(snapshots.diagramId, id));
            const snap = rows.find((s) => s.version === version);
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
