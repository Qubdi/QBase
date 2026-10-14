import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit/audit.js';
import { driftReports, driftSettings, savedConnections } from '../db/schema.js';
import {
    canWrite,
    getDiagramProject,
    getRole,
} from '../diagrams/permissions.js';
import { isValidCron, nextCronRun } from '../lib/cron.js';
import {
    badgeOf,
    latestReport,
    presentReport,
    runDriftCheck,
    summarizeReport,
    type DriftDeps,
} from './service.js';
import { parseWebhookUrl } from './webhook.js';

const diagramParam = z.object({ id: z.string().uuid() });
const reportParam = z.object({
    id: z.string().uuid(),
    reportId: z.string().uuid(),
});

const settingsBody = z.object({
    enabled: z.boolean(),
    schedule: z.string().trim().max(100).default('0 3 * * *'),
    connectionId: z.string().uuid().nullable(),
    schemas: z.array(z.string().max(200)).max(200).default([]),
    tables: z.array(z.string().max(400)).max(5000).default([]),
    sourceKeys: z
        .object({
            tables: z.record(z.string()).default({}),
            columns: z.record(z.string()).default({}),
        })
        .default({ tables: {}, columns: {} }),
    webhookUrl: z.string().trim().max(2000).nullable().default(null),
});

const presentSettings = (s: typeof driftSettings.$inferSelect) => ({
    enabled: s.enabled,
    schedule: s.schedule,
    connectionId: s.connectionId,
    schemas: s.schemas,
    tables: s.tables,
    sourceKeys: s.sourceKeys,
    webhookUrl: s.webhookUrl,
    nextRunAt: s.nextRunAt,
    updatedAt: s.updatedAt,
});

export const driftRoutes =
    (deps: DriftDeps): FastifyPluginAsync =>
    async (app) => {
        const { db } = deps;
        // shares its allowance with the introspection routes
        const outbound = deps.outboundLimit
            ? { onRequest: deps.outboundLimit }
            : {};
        app.addHook('preHandler', async (req, reply) => {
            if (!req.user) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
        });

        // Drift reports describe the working copy, so only people who can edit it may see them.
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

        app.get('/:id/drift', async (req, reply) => {
            const { id } = diagramParam.parse(req.params);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            const [settings] = await db
                .select()
                .from(driftSettings)
                .where(eq(driftSettings.diagramId, id));
            const latest = await latestReport(db, id);
            return {
                settings: settings ? presentSettings(settings) : null,
                latest: latest ? summarizeReport(latest) : null,
                badge: badgeOf(latest),
            };
        });

        app.put('/:id/drift', async (req, reply) => {
            const { id } = diagramParam.parse(req.params);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            const body = settingsBody.parse(req.body);

            if (!isValidCron(body.schedule)) {
                return reply.code(400).send({ error: 'invalid_schedule' });
            }
            if (body.webhookUrl) {
                const parsed = parseWebhookUrl(body.webhookUrl);
                if ('error' in parsed) {
                    return reply
                        .code(400)
                        .send({
                            error: 'invalid_webhook',
                            message: parsed.error,
                        });
                }
            }
            if (body.connectionId) {
                const projectId = await getDiagramProject(db, id);
                const [conn] = projectId
                    ? await db
                          .select({ id: savedConnections.id })
                          .from(savedConnections)
                          .where(
                              and(
                                  eq(savedConnections.id, body.connectionId),
                                  // only the diagram's own project's connections
                                  eq(savedConnections.projectId, projectId)
                              )
                          )
                    : [];
                if (!conn) {
                    return reply
                        .code(400)
                        .send({ error: 'connection_not_found' });
                }
            }
            if (body.enabled && !body.connectionId) {
                return reply.code(400).send({ error: 'connection_required' });
            }

            const values = {
                enabled: body.enabled,
                schedule: body.schedule,
                connectionId: body.connectionId,
                schemas: body.schemas,
                tables: body.tables,
                sourceKeys: body.sourceKeys,
                webhookUrl: body.webhookUrl || null,
                nextRunAt: body.enabled
                    ? nextCronRun(body.schedule, new Date())
                    : null,
                updatedBy: req.user!.id,
                updatedAt: new Date(),
            };
            const [row] = await db
                .insert(driftSettings)
                .values({ diagramId: id, ...values })
                .onConflictDoUpdate({
                    target: driftSettings.diagramId,
                    set: values,
                })
                .returning();
            await audit(db, {
                userId: req.user!.id,
                action: 'drift.configure',
                diagramId: id,
            });
            return presentSettings(row);
        });

        app.post('/:id/drift/check', outbound, async (req, reply) => {
            const { id } = diagramParam.parse(req.params);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            const [settings] = await db
                .select()
                .from(driftSettings)
                .where(eq(driftSettings.diagramId, id));
            if (!settings) {
                return reply.code(409).send({ error: 'not_configured' });
            }
            const report = await runDriftCheck(deps, id, 'manual');
            if (!report) {
                return reply.code(409).send({ error: 'already_running' });
            }
            await audit(db, {
                userId: req.user!.id,
                action: 'drift.check',
                diagramId: id,
            });
            return presentReport(report);
        });

        app.get('/:id/drift/reports', async (req, reply) => {
            const { id } = diagramParam.parse(req.params);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            const { limit } = z
                .object({
                    limit: z.coerce.number().int().min(1).max(100).default(20),
                })
                .parse(req.query);
            const rows = await db
                .select()
                .from(driftReports)
                .where(eq(driftReports.diagramId, id))
                .orderBy(desc(driftReports.runAt))
                .limit(limit);
            return rows.map(summarizeReport);
        });

        app.get('/:id/drift/reports/:reportId', async (req, reply) => {
            const { id, reportId } = reportParam.parse(req.params);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            const [row] = await db
                .select()
                .from(driftReports)
                .where(
                    and(
                        eq(driftReports.id, reportId),
                        eq(driftReports.diagramId, id)
                    )
                );
            if (!row) return reply.code(404).send({ error: 'not_found' });
            return presentReport(row);
        });

        app.post('/:id/drift/dismiss', async (req, reply) => {
            const { id } = diagramParam.parse(req.params);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            const latest = await latestReport(db, id);
            if (latest && !latest.dismissedAt) {
                await db
                    .update(driftReports)
                    .set({ dismissedAt: new Date() })
                    .where(eq(driftReports.id, latest.id));
            }
            await audit(db, {
                userId: req.user!.id,
                action: 'drift.dismiss',
                diagramId: id,
            });
            const after = await latestReport(db, id);
            return {
                latest: after ? summarizeReport(after) : null,
                badge: badgeOf(after),
            };
        });
    };
