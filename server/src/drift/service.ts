import { and, desc, eq, isNotNull, lte, or, isNull } from 'drizzle-orm';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import {
    diagrams,
    driftReports,
    driftSettings,
    savedConnections,
} from '../db/schema.js';
import { CryptoBox } from '../introspect/crypto-box.js';
import { filterMetadata } from '../introspect/filter.js';
import {
    ForbiddenTargetError,
    resolveAllowedTarget,
    type LookupAll,
} from '../introspect/net-guard.js';
import { safeMessage } from '../introspect/routes.js';
import type {
    ConnectionParams,
    IntrospectorFactory,
} from '../introspect/types.js';
import { nextCronRun } from '../lib/cron.js';
import { postJson } from './webhook.js';
import {
    countBySeverity,
    driftSignature,
    renameHints,
    toDriftItems,
    worstSeverity,
    type DriftItem,
    type SeverityCounts,
} from '../../../shared/drift.js';
import { reconcile } from '../../../shared/reconcile.js';
import {
    diagramToDesc,
    metadataToDesc,
    type DiagramLike,
    type MetadataLike,
} from '../../../shared/schema-desc.js';

export interface DriftDeps {
    db: Db;
    config: Config;
    factory: IntrospectorFactory;
    lookup?: LookupAll;
}

export type ReportRow = typeof driftReports.$inferSelect;
export type SettingsRow = typeof driftSettings.$inferSelect;

export type Trigger = 'manual' | 'schedule';

export interface SourceKeys {
    tables: Record<string, string>;
    columns: Record<string, string>;
}

const running = new Set<string>();

/** Compact view of a report, used for lists and the diagram badge. */
export function summarizeReport(r: ReportRow) {
    const counts = r.counts as SeverityCounts;
    return {
        id: r.id,
        runAt: r.runAt,
        status: r.status,
        trigger: r.trigger,
        counts,
        worst: worstSeverity(
            (['breaking', 'warning', 'info'] as const)
                .filter((s) => counts[s] > 0)
                .map((s) => ({ severity: s }))
        ),
        error: r.error,
        dismissedAt: r.dismissedAt,
        webhook: r.webhook,
    };
}

export const presentReport = (r: ReportRow) => ({
    ...summarizeReport(r),
    changes: r.changes as DriftItem[],
    renameHints: r.renameHints as string[],
});

/** What the editor shows as a badge on the diagram. */
export function badgeOf(latest: ReportRow | undefined) {
    if (!latest || latest.status === 'clean' || latest.dismissedAt) return null;
    return {
        status: latest.status,
        counts: latest.counts as SeverityCounts,
        reportId: latest.id,
    };
}

export async function latestReport(db: Db, diagramId: string) {
    const [r] = await db
        .select()
        .from(driftReports)
        .where(eq(driftReports.diagramId, diagramId))
        .orderBy(desc(driftReports.runAt))
        .limit(1);
    return r;
}

class DriftError extends Error {}

/**
 * Compares the diagram's working copy with the live database and stores a
 * report. A failure to read the database is an error report, never drift.
 */
export async function runDriftCheck(
    deps: DriftDeps,
    diagramId: string,
    trigger: Trigger,
    now: Date = new Date()
): Promise<ReportRow | null> {
    const { db } = deps;
    if (running.has(diagramId)) return null;
    running.add(diagramId);
    try {
        const [settings] = await db
            .select()
            .from(driftSettings)
            .where(eq(driftSettings.diagramId, diagramId));
        if (!settings) return null;

        const previous = await latestReport(db, diagramId);
        let secrets: string[] = [];
        let outcome:
            | {
                  status: 'clean' | 'drifted';
                  items: DriftItem[];
                  hints: string[];
              }
            | { status: 'error'; message: string };

        try {
            const [diagram] = await db
                .select()
                .from(diagrams)
                .where(eq(diagrams.id, diagramId));
            if (!diagram) return null;

            if (!settings.connectionId) {
                throw new DriftError('No database connection is set for this diagram.');
            }
            const [conn] = await db
                .select()
                .from(savedConnections)
                .where(eq(savedConnections.id, settings.connectionId));
            if (!conn) {
                throw new DriftError('The saved connection was deleted. Choose another one.');
            }
            if (!deps.config.connectionKey) {
                throw new DriftError('This server cannot read saved passwords (CONNECTION_KEY is not set).');
            }
            const password = new CryptoBox(deps.config.connectionKey).decrypt(conn.passwordEnc);
            secrets = [password];

            const params: ConnectionParams = {
                dialect: conn.dialect as ConnectionParams['dialect'],
                host: conn.host,
                port: conn.port,
                database: conn.database,
                user: conn.username,
                password,
                ssl: conn.ssl,
                trustServerCertificate: conn.trustServerCertificate,
            };
            const target = await resolveAllowedTarget(
                params.host,
                deps.config.introspectAllowHosts,
                deps.lookup
            );
            const intro = await deps.factory(params, target);
            let metadata;
            try {
                metadata = await intro.introspect({
                    schemas: settings.schemas as string[],
                });
            } finally {
                await intro.close();
            }
            metadata = filterMetadata(metadata, settings.tables as string[]);

            const cs = reconcile(
                diagramToDesc(diagram.content as DiagramLike),
                metadataToDesc(metadata as unknown as MetadataLike),
                { sourceKeys: settings.sourceKeys as SourceKeys }
            );
            const items = toDriftItems(cs.changes);
            outcome = {
                status: items.length === 0 ? 'clean' : 'drifted',
                items,
                hints: renameHints(cs.possibleRenames),
            };
        } catch (err) {
            outcome = {
                status: 'error',
                message:
                    err instanceof DriftError || err instanceof ForbiddenTargetError
                        ? err.message
                        : safeMessage(err, secrets),
            };
        }

        const items = outcome.status === 'error' ? [] : outcome.items;
        const counts = countBySeverity(items);
        const signature =
            outcome.status === 'error'
                ? `error:${outcome.message}`
                : driftSignature(items);
        const sameAsBefore =
            previous?.status === outcome.status && previous.signature === signature;

        // a dismissed report stays dismissed until the drift actually changes
        const dismissedAt = sameAsBefore ? (previous?.dismissedAt ?? null) : null;

        let webhookNote: string | null = null;
        if (outcome.status !== 'clean' && !sameAsBefore && settings.webhookUrl) {
            const diagramRow = await db
                .select({ title: diagrams.title })
                .from(diagrams)
                .where(eq(diagrams.id, diagramId));
            const result = await postJson(
                settings.webhookUrl,
                {
                    event: 'qubdidb.drift',
                    diagramId,
                    diagramTitle: diagramRow[0]?.title ?? '',
                    status: outcome.status,
                    counts,
                    error: outcome.status === 'error' ? outcome.message : undefined,
                    changes: items.slice(0, 50).map((i) => ({
                        severity: i.severity,
                        category: i.category,
                        summary: i.summary,
                    })),
                    at: now.toISOString(),
                },
                { allow: deps.config.introspectAllowHosts, lookup: deps.lookup }
            );
            webhookNote = result.ok
                ? `sent (${result.status})`
                : `failed: ${result.error ?? `HTTP ${result.status}`}`;
        }

        const [report] = await db
            .insert(driftReports)
            .values({
                diagramId,
                runAt: now,
                status: outcome.status,
                trigger,
                changes: items,
                renameHints: outcome.status === 'error' ? [] : outcome.hints,
                counts,
                error: outcome.status === 'error' ? outcome.message : null,
                signature,
                dismissedAt,
                webhook: webhookNote,
            })
            .returning();

        // keep the schedule moving even after a manual run
        if (settings.enabled) {
            const next = nextCronRun(settings.schedule, now);
            await db
                .update(driftSettings)
                .set({ nextRunAt: next })
                .where(eq(driftSettings.diagramId, diagramId));
        }
        return report;
    } finally {
        running.delete(diagramId);
    }
}

/** Runs every enabled check whose time has come. Returns how many ran. */
export async function runDueChecks(
    deps: DriftDeps,
    now: Date = new Date()
): Promise<number> {
    const due = await deps.db
        .select({ diagramId: driftSettings.diagramId })
        .from(driftSettings)
        .where(
            and(
                eq(driftSettings.enabled, true),
                isNotNull(driftSettings.connectionId),
                or(isNull(driftSettings.nextRunAt), lte(driftSettings.nextRunAt, now))
            )
        );
    let ran = 0;
    for (const { diagramId } of due) {
        // one diagram failing must not stop the others
        try {
            const r = await runDriftCheck(deps, diagramId, 'schedule', now);
            if (r) ran++;
        } catch {
            // the failure is already recorded as an error report where possible
        }
    }
    return ran;
}

/** Starts the in-process scheduler; returns a function that stops it. */
export function startDriftScheduler(
    deps: DriftDeps,
    intervalMs = 30_000
): () => void {
    let busy = false;
    const timer = setInterval(() => {
        if (busy) return;
        busy = true;
        runDueChecks(deps)
            .catch(() => undefined)
            .finally(() => {
                busy = false;
            });
    }, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
}
