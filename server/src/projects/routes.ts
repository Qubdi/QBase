import { and, count, eq, ilike, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { diagrams, projectMembers, projects } from '../db/schema.js';
import { getProjectRole } from '../diagrams/permissions.js';
import {
    containsPattern,
    offsetOf,
    pageOf,
    pagingQuery,
} from '../lib/paging.js';

const refParam = z.object({ ref: z.string().min(1).max(200) });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const columns = {
    id: projects.id,
    name: projects.name,
    slug: projects.slug,
    description: projects.description,
    // explicit table names: bare column names would resolve to the inner table
    diagramCount: sql<number>`(select count(*)::int from diagrams d where d.project_id = projects.id)`,
};

/** Projects the signed-in user can work in. Admins see every project. */
export const projectRoutes =
    (db: Db): FastifyPluginAsync =>
    async (app) => {
        app.addHook('preHandler', async (req, reply) => {
            if (!req.user) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
        });

        // paged and searchable; non-admins only ever get their own projects
        app.get('/', async (req) => {
            const paging = pagingQuery.parse(req.query);
            const search = paging.q
                ? or(
                      ilike(projects.name, containsPattern(paging.q)),
                      ilike(projects.slug, containsPattern(paging.q))
                  )
                : undefined;

            if (req.user!.isAdmin) {
                const [{ value: total }] = await db
                    .select({ value: count() })
                    .from(projects)
                    .where(search);
                const rows = await db
                    .select(columns)
                    .from(projects)
                    .where(search)
                    .orderBy(projects.name, projects.id)
                    .limit(paging.limit)
                    .offset(offsetOf(paging));
                return pageOf(
                    rows.map((p) => ({ ...p, role: 'owner' as const })),
                    total,
                    paging
                );
            }

            const mine = and(eq(projectMembers.userId, req.user!.id), search);
            const [{ value: total }] = await db
                .select({ value: count() })
                .from(projectMembers)
                .innerJoin(projects, eq(projects.id, projectMembers.projectId))
                .where(mine);
            const rows = await db
                .select({ ...columns, role: projectMembers.role })
                .from(projectMembers)
                .innerJoin(projects, eq(projects.id, projectMembers.projectId))
                .where(mine)
                .orderBy(projects.name, projects.id)
                .limit(paging.limit)
                .offset(offsetOf(paging));
            return pageOf(rows, total, paging);
        });

        // one project by id or by its web address; 404 unless the user may see it
        app.get('/:ref', async (req, reply) => {
            const { ref } = refParam.parse(req.params);
            let [project] = UUID.test(ref)
                ? await db.select(columns).from(projects).where(eq(projects.id, ref))
                : [];
            if (!project) {
                [project] = await db
                    .select(columns)
                    .from(projects)
                    .where(sql`lower(${projects.slug}) = ${ref.toLowerCase()}`);
            }
            const role = project
                ? await getProjectRole(db, project.id, req.user!.id)
                : null;
            if (!project || !role) {
                return reply.code(404).send({ error: 'not_found' });
            }
            return { ...project, role };
        });
    };
