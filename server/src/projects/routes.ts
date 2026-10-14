import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '../db/client.js';
import { projectMembers, projects } from '../db/schema.js';

/** Projects the signed-in user can work in (admins see all of them). */
export const projectRoutes =
    (db: Db): FastifyPluginAsync =>
    async (app) => {
        app.addHook('preHandler', async (req, reply) => {
            if (!req.user) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
        });

        app.get('/', async (req) => {
            if (req.user!.isAdmin) {
                const rows = await db
                    .select({
                        id: projects.id,
                        name: projects.name,
                        description: projects.description,
                    })
                    .from(projects)
                    .orderBy(projects.name);
                return rows.map((p) => ({ ...p, role: 'owner' as const }));
            }
            return db
                .select({
                    id: projects.id,
                    name: projects.name,
                    description: projects.description,
                    role: projectMembers.role,
                })
                .from(projectMembers)
                .innerJoin(projects, eq(projects.id, projectMembers.projectId))
                .where(eq(projectMembers.userId, req.user!.id))
                .orderBy(projects.name);
        });
    };
