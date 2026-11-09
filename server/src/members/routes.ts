import { MAX_UNPAGED_ROWS } from '../lib/limits.js';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { projectMembers, users } from '../db/schema.js';
import { getDiagramProject, getRole } from '../diagrams/permissions.js';

const diagramParam = z.object({ id: z.string().uuid() });

/**
 * Who can open a diagram. Access is granted per project by an admin (see the
 * /admin routes), so this is read-only.
 */
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
            const projectId = await getDiagramProject(db, id);
            if (!projectId) return reply.code(404).send({ error: 'not_found' });
            return db
                .select({
                    userId: users.id,
                    email: users.email,
                    role: projectMembers.role,
                })
                .from(projectMembers)
                .innerJoin(users, eq(users.id, projectMembers.userId))
                .where(eq(projectMembers.projectId, projectId))
                .orderBy(users.email)
                .limit(MAX_UNPAGED_ROWS);
        });
    };
