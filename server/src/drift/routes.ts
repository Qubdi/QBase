import { and, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit/audit.js';
import { driftReports, driftSettings, savedConnections } from '../db/schema.js';
import {
    canWrite,
    getDiagramProject,
    getRole,
} from '../diagrams/permissions.js';
import {
    badgeOf,
    latestReportSummary,
    reportSummaryColumns,
    presentReport,
    reusableReport,
    runDriftCheck,
    summarizeReport,
    type DriftDeps,
    type ReportRow,
} from './service.js';
import { cryptoBoxFor, type CryptoBox } from '../introspect/crypto-box.js';
import { parseWebhookUrl, sealWebhookUrl, webhookHost } from './webhook.js';

const diagramParam = z.object({ id: z.string().uuid() });
const reportParam = z.object({
    id: z.string().uuid(),
    reportId: z.string().uuid(),
});

// `cached=1`: a recent report may stand in for reading the database (see reusableReport)
const checkQuery = z.object({ cached: z.enum(['1']).optional() });

/** A check's report, with the badge the diagram shows once it is stored. */
const presentCheck = (r: ReportRow) => ({
    ...presentReport(r),
    badge: badgeOf(r),
});

const settingsBody = z.object({
    connectionId: z.string().uuid().nullable(),
    schemas: z.array(z.string().max(200)).max(200).default([]),
    tables: z.array(z.string().max(400)).max(5000).default([]),
    sourceKeys: z
        .object({
            tables: z.record(z.string(), z.string()).default({}),
            columns: z.record(z.string(), z.string()).default({}),
        })
        .default({ tables: {}, columns: {} }),
    // left out keeps the stored URL, which is never sent back; null or blank clears it
    webhookUrl: z.string().trim().max(2000).nullable().optional(),
});

const presentSettings = (
    s: typeof driftSettings.$inferSelect,
    box: CryptoBox | null
) => ({
    connectionId: s.connectionId,
    schemas: s.schemas,
    tables: s.tables,
    sourceKeys: s.sourceKeys,
    webhookHost: webhookHost(box, s.webhookUrl),
    updatedAt: s.updatedAt,
});

export const driftRoutes =
    (deps: DriftDeps): FastifyPluginAsync =>
    async (app) => {
        const { db } = deps;
        const key = deps.config.secretsKey;
        const box = () => (key ? cryptoBoxFor(key, 'webhook') : null);
        // shares its allowance with the introspection routes
        const outbound = deps.outboundLimit
            ? { preHandler: deps.outboundLimit }
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
            const latest = await latestReportSummary(db, id);
            return {
                settings: settings ? presentSettings(settings, box()) : null,
                latest: latest ? summarizeReport(latest) : null,
                badge: badgeOf(latest),
            };
        });

        app.put('/:id/drift', async (req, reply) => {
            const { id } = diagramParam.parse(req.params);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            const body = settingsBody.parse(req.body);

            if (body.webhookUrl) {
                const parsed = parseWebhookUrl(body.webhookUrl, deps.config.webhookAllowHosts);
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

            if (body.webhookUrl && !box()) {
                return reply.code(400).send({
                    error: 'encryption_key_missing',
                    message: 'Set SECRETS_KEY or CONNECTION_KEY to store a webhook',
                });
            }
            // what the request does to the webhook, for the audit row
            let webhookChange: 'set' | 'changed' | 'cleared' | undefined;
            if (body.webhookUrl !== undefined) {
                const [before] = await db
                    .select({ webhookUrl: driftSettings.webhookUrl })
                    .from(driftSettings)
                    .where(eq(driftSettings.diagramId, id));
                const had = !!before?.webhookUrl;
                webhookChange = body.webhookUrl
                    ? had
                        ? 'changed'
                        : 'set'
                    : had
                      ? 'cleared'
                      : undefined;
            }
            const values = {
                connectionId: body.connectionId,
                schemas: body.schemas,
                tables: body.tables,
                sourceKeys: body.sourceKeys,
                ...(body.webhookUrl === undefined
                    ? {}
                    : {
                          webhookUrl: body.webhookUrl
                              ? sealWebhookUrl(box()!, body.webhookUrl)
                              : null,
                      }),
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
                // the host only: the path and query may hold a token
                meta: webhookChange
                    ? {
                          webhook: webhookChange,
                          ...(body.webhookUrl
                              ? { host: new URL(body.webhookUrl).host }
                              : {}),
                      }
                    : undefined,
            });
            return presentSettings(row, box());
        });

        app.post('/:id/drift/check', outbound, async (req, reply) => {
            const { id } = diagramParam.parse(req.params);
            const { cached } = checkQuery.parse(req.query);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            const [settings] = await db
                .select()
                .from(driftSettings)
                .where(eq(driftSettings.diagramId, id));
            if (!settings) {
                return reply.code(409).send({ error: 'not_configured' });
            }
            if (!settings.connectionId) {
                return reply.code(400).send({ error: 'connection_required' });
            }
            // only the check made on opening a diagram may reuse a report; asking
            // for a check always reads the database, and a reused report is not a check
            const reused = cached
                ? await reusableReport(db, id, deps.config.driftCacheSeconds)
                : null;
            if (reused) return presentCheck(reused);
            const report = await runDriftCheck(deps, id);
            if (report === 'running') {
                return reply.code(409).send({ error: 'already_running' });
            }
            // settings or the diagram went away while the request was waiting
            if (report === 'not_configured') {
                return reply.code(409).send({ error: 'not_configured' });
            }
            if (report === 'not_found') {
                return reply.code(404).send({ error: 'not_found' });
            }
            await audit(db, {
                userId: req.user!.id,
                action: 'drift.check',
                diagramId: id,
            });
            return presentCheck(report);
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
                .select(reportSummaryColumns)
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
            const latest = await latestReportSummary(db, id);
            if (latest && !latest.dismissedAt) {
                // only a row this call changed is worth a log entry: two dismissals
                // at once, or one of nothing, leave no trace of a second
                const changed = await db
                    .update(driftReports)
                    .set({ dismissedAt: new Date() })
                    .where(and(eq(driftReports.id, latest.id), isNull(driftReports.dismissedAt)))
                    .returning({ id: driftReports.id });
                if (changed.length > 0) {
                    await audit(db, {
                        userId: req.user!.id,
                        action: 'drift.dismiss',
                        diagramId: id,
                    });
                }
            }
            const after = await latestReportSummary(db, id);
            return {
                latest: after ? summarizeReport(after) : null,
                badge: badgeOf(after),
            };
        });
    };
