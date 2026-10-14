import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit/audit.js';
import type { Db } from '../db/client.js';
import { diagramMembers, users } from '../db/schema.js';
import { getRole } from '../diagrams/permissions.js';

const diagramParam = z.object({ id: z.string().uuid() });
const memberParam = z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
});
const addBody = z.object({
    email: z.string().trim().toLowerCase().email(),
    role: z.enum(['editor', 'viewer']),
});
const roleBody = z.object({ role: z.enum(['editor', 'viewer']) });

export const memberRoutes =
    (db: Db): FastifyPluginAsync =>
    async (app) => {
        app.addHook('preHandler', async (req, reply) => {
            if (!req.user) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
        });

        app.get('/:id/members', async (req, reply) => {
            const { id } = diagramParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            return db
                .select({
                    userId: users.id,
                    email: users.email,
                    role: diagramMembers.role,
                })
                .from(diagramMembers)
                .innerJoin(users, eq(users.id, diagramMembers.userId))
                .where(eq(diagramMembers.diagramId, id));
        });

        app.post('/:id/members', async (req, reply) => {
            const { id } = diagramParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            if (role !== 'owner') {
                return reply.code(403).send({ error: 'forbidden' });
            }
            const body = addBody.parse(req.body);
            const [target] = await db
                .select({ id: users.id, email: users.email })
                .from(users)
                .where(eq(users.email, body.email));
            if (!target) {
                return reply.code(404).send({ error: 'user_not_found' });
            }
            if (await getRole(db, id, target.id)) {
                return reply.code(409).send({ error: 'already_member' });
            }
            await db.insert(diagramMembers).values({
                diagramId: id,
                userId: target.id,
                role: body.role,
            });
            await audit(db, {
                userId: req.user!.id,
                action: 'member.add',
                diagramId: id,
            });
            return reply.code(201).send({
                userId: target.id,
                email: target.email,
                role: body.role,
            });
        });

        app.patch('/:id/members/:userId', async (req, reply) => {
            const { id, userId } = memberParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            if (role !== 'owner') {
                return reply.code(403).send({ error: 'forbidden' });
            }
            const targetRole = await getRole(db, id, userId);
            if (!targetRole) {
                return reply.code(404).send({ error: 'member_not_found' });
            }
            if (targetRole === 'owner') {
                return reply.code(400).send({ error: 'cannot_change_owner' });
            }
            const body = roleBody.parse(req.body);
            await db
                .update(diagramMembers)
                .set({ role: body.role })
                .where(
                    and(
                        eq(diagramMembers.diagramId, id),
                        eq(diagramMembers.userId, userId)
                    )
                );
            await audit(db, {
                userId: req.user!.id,
                action: 'member.role_change',
                diagramId: id,
            });
            return { userId, role: body.role };
        });

        app.delete('/:id/members/:userId', async (req, reply) => {
            const { id, userId } = memberParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            if (role !== 'owner') {
                return reply.code(403).send({ error: 'forbidden' });
            }
            const targetRole = await getRole(db, id, userId);
            if (!targetRole) {
                return reply.code(404).send({ error: 'member_not_found' });
            }
            if (targetRole === 'owner') {
                return reply.code(400).send({ error: 'cannot_remove_owner' });
            }
            await db
                .delete(diagramMembers)
                .where(
                    and(
                        eq(diagramMembers.diagramId, id),
                        eq(diagramMembers.userId, userId)
                    )
                );
            await audit(db, {
                userId: req.user!.id,
                action: 'member.remove',
                diagramId: id,
            });
            return reply.code(204).send();
        });
    };
