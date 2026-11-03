import { desc, eq, sql } from 'drizzle-orm';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import {
    diagrams,
    driftReports,
    driftSettings,
    savedConnections,
} from '../db/schema.js';
import { cryptoBoxFor } from '../introspect/crypto-box.js';
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
import type { RequestHook } from '../lib/rate-key.js';
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
    /** per-user allowance for checks */
    outboundLimit?: RequestHook;
}

export type ReportRow = typeof driftReports.$inferSelect;

/**
 * A report without its changes and rename hints, which can be large: all a list,
 * a badge or a dismiss needs.
 */
export const reportSummaryColumns = {
    id: driftReports.id,
    diagramId: driftReports.diagramId,
    runAt: driftReports.runAt,
    status: driftReports.status,
    trigger: driftReports.trigger,
    counts: driftReports.counts,
    error: driftReports.error,
    dismissedAt: driftReports.dismissedAt,
    webhook: driftReports.webhook,
};
export type ReportSummaryRow = Pick<ReportRow, keyof typeof reportSummaryColumns>;
export interface SourceKeys {
    tables: Record<string, string>;
    columns: Record<string, string>;
}

// diagrams with a check in progress; per process, like the rate limits
const running = new Set<string>();

/** Compact view of a report, used for lists and the diagram badge. */
export function summarizeReport(r: ReportSummaryRow) {
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
export function badgeOf(latest: ReportSummaryRow | undefined) {
    if (!latest || latest.status === 'clean' || latest.dismissedAt) return null;
    return {
        status: latest.status,
        counts: latest.counts as SeverityCounts,
        reportId: latest.id,
    };
}

/** The latest report without its changes. */
export async function latestReportSummary(db: Db, diagramId: string) {
    const [r] = await db
        .select(reportSummaryColumns)
        .from(driftReports)
        .where(eq(driftReports.diagramId, diagramId))
        .orderBy(desc(driftReports.runAt))
        .limit(1);
    return r;
}

/** What a new check compares itself with: the last report's outcome, not its changes. */
async function latestOutcome(db: Db, diagramId: string) {
    const [r] = await db
        .select({
            status: driftReports.status,
            signature: driftReports.signature,
            dismissedAt: driftReports.dismissedAt,
        })
        .from(driftReports)
        .where(eq(driftReports.diagramId, diagramId))
        .orderBy(desc(driftReports.runAt))
        .limit(1);
    return r;
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

/**
 * The latest report, when it can stand in for a new check: it is recent enough,
 * it found a result (a failure to reach the database is retried), and neither
 * the diagram nor the drift settings changed after it ran. Editing a saved
 * connection counts as a settings change. Changes made in the database itself
 * are only seen once the report is older than `ttlSeconds`.
 */
export async function reusableReport(
    db: Db,
    diagramId: string,
    ttlSeconds: number,
    now: Date = new Date()
): Promise<ReportRow | null> {
    if (ttlSeconds <= 0) return null;
    const latest = await latestReport(db, diagramId);
    if (
        !latest ||
        latest.status === 'error' ||
        now.getTime() - latest.runAt.getTime() >= ttlSeconds * 1000
    ) {
        return null;
    }
    const [diagram] = await db
        .select({ updatedAt: diagrams.updatedAt })
        .from(diagrams)
        .where(eq(diagrams.id, diagramId));
    const [settings] = await db
        .select({ updatedAt: driftSettings.updatedAt })
        .from(driftSettings)
        .where(eq(driftSettings.diagramId, diagramId));
    if (!diagram || !settings) return null;
    // strictly before: a change in the same millisecond is not trusted to be older
    const ranAt = latest.runAt.getTime();
    const unchanged =
        diagram.updatedAt.getTime() < ranAt &&
        settings.updatedAt.getTime() < ranAt;
    return unchanged ? latest : null;
}

class DriftError extends Error {}

/**
 * Largest working copy a check compares, in bytes: the comparison runs on the
 * event loop, so it has the cap the lint route has.
 */
export const DRIFT_DIAGRAM_LIMIT = 5 * 1024 * 1024;

/** Why a check did not run: another is running, or what it needs is gone. */
export type DriftSkip = 'running' | 'not_configured' | 'not_found';

/**
 * Compares the diagram's working copy with the live database and stores a
 * report. A failure to read the database is an error report, never drift.
 * Answers why, instead of a report, when the check could not start.
 */
export async function runDriftCheck(
    deps: DriftDeps,
    diagramId: string,
    now: Date = new Date()
): Promise<ReportRow | DriftSkip> {
    const { db } = deps;
    if (running.has(diagramId)) return 'running';
    running.add(diagramId);
    try {
        const [settings] = await db
            .select()
            .from(driftSettings)
            .where(eq(driftSettings.diagramId, diagramId));
        if (!settings) return 'not_configured';

        const previous = await latestOutcome(db, diagramId);
        let secrets: string[] = [];
        let outcome:
            | {
                  status: 'clean' | 'drifted';
                  items: DriftItem[];
                  hints: string[];
              }
            | { status: 'error'; message: string };

        try {
            // the size first, so a diagram over the cap is never loaded
            const [sized] = await db
                .select({
                    size: sql<number>`octet_length(${diagrams.content}::text)`.mapWith(
                        Number
                    ),
                })
                .from(diagrams)
                .where(eq(diagrams.id, diagramId));
            if (!sized) return 'not_found';
            if (sized.size > DRIFT_DIAGRAM_LIMIT) {
                throw new DriftError(
                    `The diagram is too large to compare (over ${DRIFT_DIAGRAM_LIMIT / (1024 * 1024)} MB).`
                );
            }
            const [diagram] = await db
                .select({ content: diagrams.content })
                .from(diagrams)
                .where(eq(diagrams.id, diagramId));
            if (!diagram) return 'not_found';

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
            const password = cryptoBoxFor(deps.config.connectionKey).decrypt(conn.passwordEnc);
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
                    event: 'qbase.drift',
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
                trigger: 'manual',
                changes: items,
                renameHints: outcome.status === 'error' ? [] : outcome.hints,
                counts,
                error: outcome.status === 'error' ? outcome.message : null,
                signature,
                dismissedAt,
                webhook: webhookNote,
            })
            .returning();

        return report;
    } finally {
        running.delete(diagramId);
    }
}
