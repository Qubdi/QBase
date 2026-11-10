import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { liveViewers } from '../db/schema.js';

/**
 * Open live share streams, counted in the database so the caps hold across
 * every server process. A viewer is a row that its stream renews on each
 * heartbeat; rows nobody renews stop counting when they expire.
 */

// opens are rare next to everything else the database does, so one lock for
// all of them is simpler than a lock per link and address and cannot deadlock
const OPEN_LOCK = sql`pg_advisory_xact_lock(hashtextextended('live_viewers', 0))`;

export interface ViewerCaps {
    maxPerLink: number;
    maxPerIp: number;
    /** How long a row counts without being renewed. */
    ttlMs: number;
}

/** Takes a slot; the viewer's id, or null when the link or the address is full. */
export async function acquireViewer(
    db: Db,
    linkId: string,
    ip: string,
    caps: ViewerCaps,
    now: Date = new Date()
): Promise<string | null> {
    return db.transaction(async (tx) => {
        await tx.execute(sql`select ${OPEN_LOCK}`);
        const live = gt(liveViewers.expiresAt, now);
        const [{ perLink, perIp }] = await tx
            .select({
                perLink: sql<number>`count(*) filter (where ${eq(liveViewers.linkId, linkId)})`.mapWith(Number),
                perIp: sql<number>`count(*) filter (where ${eq(liveViewers.ip, ip)})`.mapWith(Number),
            })
            .from(liveViewers)
            .where(and(live));
        if (perLink >= caps.maxPerLink || perIp >= caps.maxPerIp) return null;
        const [row] = await tx
            .insert(liveViewers)
            .values({
                linkId,
                ip,
                expiresAt: new Date(now.getTime() + caps.ttlMs),
            })
            .returning({ id: liveViewers.id });
        return row!.id;
    });
}

/** Keeps a viewer counting. A row that was purged meanwhile is put back. */
export async function renewViewer(
    db: Db,
    id: string,
    linkId: string,
    ip: string,
    ttlMs: number,
    now: Date = new Date()
): Promise<void> {
    await db
        .insert(liveViewers)
        .values({ id, linkId, ip, expiresAt: new Date(now.getTime() + ttlMs) })
        .onConflictDoUpdate({
            target: liveViewers.id,
            set: { expiresAt: new Date(now.getTime() + ttlMs) },
        });
}

/** Gives the slot back. */
export async function releaseViewer(db: Db, id: string): Promise<void> {
    await db.delete(liveViewers).where(eq(liveViewers.id, id));
}

/** Deletes rows nobody renewed; they already stopped counting. */
export async function purgeExpiredViewers(
    db: Db,
    now: Date = new Date()
): Promise<number> {
    const res = await db.delete(liveViewers).where(lt(liveViewers.expiresAt, now));
    return res.rowCount ?? 0;
}
