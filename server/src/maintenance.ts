import { lt } from 'drizzle-orm';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { auditLog, sessions } from './db/schema.js';

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

/** Deletes audit rows older than `days`. 0 or less keeps everything. */
export async function purgeAuditLog(
    db: Db,
    days: number,
    now: Date = new Date()
): Promise<number> {
    if (!(days > 0)) return 0;
    const rows = await db
        .delete(auditLog)
        .where(lt(auditLog.at, new Date(now.getTime() - days * DAY_MS)))
        .returning({ id: auditLog.id });
    return rows.length;
}

export async function runMaintenance(
    db: Db,
    config: Pick<Config, 'auditRetentionDays'>,
    now: Date = new Date()
) {
    return {
        sessions: await purgeExpiredSessions(db, now),
        audit: await purgeAuditLog(db, config.auditRetentionDays, now),
    };
}

/**
 * Runs the clean-up now and then every `intervalMs`. The returned function
 * stops it and waits for a run that is already going.
 */
export function startMaintenance(
    deps: { db: Db; config: Pick<Config, 'auditRetentionDays'> },
    intervalMs = 3_600_000
): () => Promise<void> {
    let current: Promise<void> | null = null;
    const tick = () => {
        if (current) return;
        current = runMaintenance(deps.db, deps.config)
            .then(() => undefined)
            .catch((err: unknown) => {
                console.error('Maintenance failed:', err);
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
