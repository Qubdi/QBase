import { and, isNotNull, lt, or, sql } from 'drizzle-orm';
import { safeError } from './lib/safe-error.js';
import type { Config } from './config.js';
import { purgeExpiredViewers } from './share/viewers.js';
import { MAINTENANCE_LOCK, withAdvisoryLock, type Db } from './db/client.js';
import {
    diagramLocks,
    lockPokes,
    mfaChallenges,
    rateCounters,
    shareLinks,
    sessions,
} from './db/schema.js';

const DAY_MS = 86_400_000;

/** Deletes sessions that have expired. They are already refused at login. */
export async function purgeExpiredSessions(
    db: Db,
    now: Date = new Date()
): Promise<number> {
    const rows = await db
        .delete(sessions)
        .where(lt(sessions.expiresAt, now))
        .returning({ id: sessions.id });
    return rows.length;
}

/** Deletes second-step sign-in challenges that ran out. They are already refused. */
export async function purgeExpiredMfaChallenges(
    db: Db,
    now: Date = new Date()
): Promise<number> {
    const res = await db
        .delete(mfaChallenges)
        .where(lt(mfaChallenges.expiresAt, now));
    return res.rowCount ?? 0;
}

/**
 * Deletes rate-limit and lockout counters whose window has closed. They are
 * already ignored (a closed window starts again at one); this only keeps the
 * table small.
 */
export async function purgeExpiredCounters(
    db: Db,
    now: Date = new Date()
): Promise<number> {
    const res = await db
        .delete(rateCounters)
        .where(lt(rateCounters.expiresAt, now));
    return res.rowCount ?? 0;
}

/** Deletes edit locks nobody renewed. They are already ignored. */
export async function purgeExpiredLocks(
    db: Db,
    now: Date = new Date()
): Promise<number> {
    const res = await db
        .delete(diagramLocks)
        .where(lt(diagramLocks.expiresAt, now));
    return res.rowCount ?? 0;
}

/** How long a request to step out is kept, after it was made, for the wait between pokes. */
const POKE_KEEP_DAYS = 1;

/** Deletes requests to step out (pokes) a day after they were made. They are already over. */
export async function purgeOldPokes(
    db: Db,
    now: Date = new Date()
): Promise<number> {
    const cutoff = new Date(now.getTime() - POKE_KEEP_DAYS * DAY_MS);
    const res = await db.delete(lockPokes).where(lt(lockPokes.createdAt, cutoff));
    return res.rowCount ?? 0;
}

/**
 * Deletes share links that stopped working `days` or more ago (revoked, or
 * past their expiry). They are already refused; this only keeps the table and
 * each diagram's link list from growing for ever. 0 or less keeps everything.
 */
export async function purgeDeadLinks(
    db: Db,
    days: number,
    now: Date = new Date()
): Promise<number> {
    if (!(days > 0)) return 0;
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    const res = await db
        .delete(shareLinks)
        .where(
            or(
                and(isNotNull(shareLinks.revokedAt), lt(shareLinks.revokedAt, cutoff)),
                and(isNotNull(shareLinks.expiresAt), lt(shareLinks.expiresAt, cutoff))
            )
        );
    return res.rowCount ?? 0;
}

const AUDIT_BATCH = 5000;

/**
 * Deletes audit rows older than `days`, a batch at a time so a large backlog
 * never holds one long lock. 0 or less keeps everything.
 */
export async function purgeAuditLog(
    db: Db,
    days: number,
    now: Date = new Date(),
    batch = AUDIT_BATCH
): Promise<number> {
    if (!(days > 0)) return 0;
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    let total = 0;
    for (;;) {
        const res = await db.execute(sql`
            delete from audit_log
            where id in (
                select id from audit_log where at < ${cutoff} limit ${batch}
            )
        `);
        const n = res.rowCount ?? 0;
        total += n;
        if (n < batch) return total;
    }
}

const PRUNE_BATCH = 5000;

/**
 * Applies the snapshot limit to diagrams published before it existed: removes
 * every version more than `keep` behind that diagram's newest one, a batch at a
 * time so a large backlog never holds one long lock or runs into the statement
 * timeout.
 */
export async function pruneSnapshots(
    db: Db,
    keep: number,
    batch = PRUNE_BATCH
): Promise<number> {
    if (!(keep > 0)) return 0;
    let total = 0;
    for (;;) {
        const res = await db.execute(sql`
            delete from snapshots
            where id in (
                select s.id
                from snapshots s
                join (
                    select diagram_id, max(version) as newest
                    from snapshots
                    group by diagram_id
                ) latest on latest.diagram_id = s.diagram_id
                where s.version <= latest.newest - ${keep}
                limit ${batch}
            )
        `);
        const n = res.rowCount ?? 0;
        total += n;
        if (n < batch) return total;
    }
}

/** Removes every drift report beyond the newest `keep` of each diagram, a batch at a time. */
export async function pruneDriftReports(
    db: Db,
    keep: number,
    batch = PRUNE_BATCH
): Promise<number> {
    if (!(keep > 0)) return 0;
    let total = 0;
    for (;;) {
        const res = await db.execute(sql`
            delete from drift_reports
            where id in (
                select id from (
                    select id,
                           row_number() over (
                               partition by diagram_id order by run_at desc, id desc
                           ) as place
                    from drift_reports
                ) ranked
                where place > ${keep}
                limit ${batch}
            )
        `);
        const n = res.rowCount ?? 0;
        total += n;
        if (n < batch) return total;
    }
}

const STATS_BATCH = 50;
const STATS_BATCHES_PER_RUN = 200;

/**
 * Fills in the stored stats and content size of rows written before the app
 * kept them: a diagram's size, and a snapshot's numbers and size, worked out
 * from its content a few rows at a time (a diagram's own stats were kept by
 * the generated columns it had before). Until a row is reached, readers take
 * its numbers from the content, so this changes no answer, only the cost of
 * giving it. At most `maxBatches` per run; the next hourly run continues.
 */
export async function fillStoredStats(
    db: Db,
    batch = STATS_BATCH,
    maxBatches = STATS_BATCHES_PER_RUN
): Promise<number> {
    let total = 0;
    for (let i = 0; i < maxBatches; i++) {
        const diagramsDone = await db.execute(sql`
            update diagrams
            set stat_content_bytes = octet_length(content::text)
            where id in (
                select id from diagrams where stat_content_bytes is null limit ${batch}
            )
        `);
        const snapshotsDone = await db.execute(sql`
            update snapshots
            set stat_database_type = nullif(content->>'databaseType', ''),
                stat_database_edition = nullif(content->>'databaseEdition', ''),
                stat_table_count = case when jsonb_typeof(content->'tables') = 'array'
                    then jsonb_array_length(content->'tables') else 0 end,
                stat_relationship_count = case when jsonb_typeof(content->'relationships') = 'array'
                    then jsonb_array_length(content->'relationships') else 0 end,
                stat_created_at = nullif(content->>'createdAt', ''),
                stat_content_bytes = octet_length(content::text)
            where id in (
                select id from snapshots where stat_table_count is null limit ${batch}
            )
        `);
        const n = (diagramsDone.rowCount ?? 0) + (snapshotsDone.rowCount ?? 0);
        total += n;
        if ((diagramsDone.rowCount ?? 0) < batch && (snapshotsDone.rowCount ?? 0) < batch)
            return total;
    }
    return total;
}

type MaintenanceConfig = Pick<
    Config,
    'auditRetentionDays' | 'snapshotKeep' | 'driftReportKeep' | 'deadLinkKeepDays'
>;

export async function runMaintenance(
    db: Db,
    config: MaintenanceConfig,
    now: Date = new Date()
) {
    const steps = {
        sessions: () => purgeExpiredSessions(db, now),
        mfaChallenges: () => purgeExpiredMfaChallenges(db, now),
        locks: () => purgeExpiredLocks(db, now),
        pokes: () => purgeOldPokes(db, now),
        counters: () => purgeExpiredCounters(db, now),
        viewers: () => purgeExpiredViewers(db, now),
        links: () => purgeDeadLinks(db, config.deadLinkKeepDays, now),
        audit: () => purgeAuditLog(db, config.auditRetentionDays, now),
        snapshots: () => pruneSnapshots(db, config.snapshotKeep),
        driftReports: () => pruneDriftReports(db, config.driftReportKeep),
        stats: () => fillStoredStats(db),
    };
    // one step failing must not skip the ones after it until the next hour
    const removed = {} as Record<keyof typeof steps, number>;
    const failed: Array<keyof typeof steps> = [];
    for (const [name, step] of Object.entries(steps) as Array<
        [keyof typeof steps, () => Promise<number>]
    >) {
        try {
            removed[name] = await step();
        } catch (err) {
            removed[name] = 0;
            failed.push(name);
            console.error(`Maintenance step "${name}" failed:`, safeError(err));
        }
    }
    return { ...removed, failed };
}

/**
 * Runs the clean-up now and then every `intervalMs`. The returned function
 * stops it and waits for a run that is already going.
 */
export function startMaintenance(
    deps: { db: Db; config: MaintenanceConfig },
    intervalMs = 3_600_000
): () => Promise<void> {
    let current: Promise<void> | null = null;
    const tick = () => {
        if (current) return;
        // one replica at a time: the others skip this hour's run, since the
        // pruning scans whole tables and one pass does it all
        current = withAdvisoryLock(
            deps.db,
            MAINTENANCE_LOCK,
            () => runMaintenance(deps.db, deps.config),
            { wait: false }
        )
            .then(() => undefined)
            .catch((err: unknown) => {
                console.error('Maintenance failed:', safeError(err));
            })
            .finally(() => {
                current = null;
            });
    };
    tick();
    const timer = setInterval(tick, intervalMs);
    timer.unref();
    return async () => {
        clearInterval(timer);
        await current;
    };
}
