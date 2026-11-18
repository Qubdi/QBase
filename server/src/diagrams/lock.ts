import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { diagramLocks, users } from '../db/schema.js';

/** How long a lock lasts without being renewed by its editor. */
export const LOCK_TTL_SECONDS = 90;

/**
 * A lock handed to someone (see `reserveLock`) is held under an editor id
 * that starts with this, until one of that person's pages claims it. The page
 * that was asked for it is about to reload, and a reloaded page is a new
 * editor with a new id, so the lock cannot be kept under the old one.
 */
export const HANDOFF_PREFIX = 'handoff:';
/** How long a handed-over lock waits to be claimed before it runs out. */
export const HANDOFF_SECONDS = 60;

export type LockResult = { held: true } | { held: false; holder: string };

/**
 * Takes the edit lock of a diagram, or renews it when `editorId` already holds
 * it. Someone else's lock is only taken over once it has run out. A lock
 * handed over to this user and not yet claimed is theirs to take, under any
 * editor id. The check and the write are one statement, so two editors cannot
 * both win.
 */
export async function acquireLock(
    db: Db,
    diagramId: string,
    userId: string,
    editorId: string
): Promise<LockResult> {
    const expiresAt = sql`now() + make_interval(secs => ${LOCK_TTL_SECONDS})`;
    // a lock released between the two statements leaves nobody to name: retry
    for (let attempt = 0; attempt < 2; attempt++) {
        const won = await db
            .insert(diagramLocks)
            .values({ diagramId, userId, editorId, expiresAt })
            .onConflictDoUpdate({
                target: diagramLocks.diagramId,
                set: { userId, editorId, expiresAt },
                setWhere: sql`${diagramLocks.expiresAt} <= now() or (${diagramLocks.userId} = ${userId} and (${diagramLocks.editorId} = ${editorId} or ${diagramLocks.editorId} like ${HANDOFF_PREFIX + '%'}))`,
            })
            .returning({ diagramId: diagramLocks.diagramId });
        if (won.length > 0) return { held: true };
        const [holder] = await db
            .select({ email: users.email })
            .from(diagramLocks)
            .innerJoin(users, eq(users.id, diagramLocks.userId))
            .where(eq(diagramLocks.diagramId, diagramId));
        if (holder) return { held: false, holder: holder.email };
    }
    return { held: false, holder: 'Someone else' };
}

/**
 * Sets the lock aside for a user whose page is about to reload: it takes a free
 * or run-out lock, or turns the one `editorId` holds into a handed-over one.
 * Nobody else can take it until it runs out, and any page of this user can
 * claim it (see `acquireLock`). Says whether it was done.
 */
export async function reserveLock(
    db: Db,
    diagramId: string,
    userId: string,
    editorId: string
): Promise<boolean> {
    const handoff = `${HANDOFF_PREFIX}${randomUUID()}`;
    const expiresAt = sql`now() + make_interval(secs => ${HANDOFF_SECONDS})`;
    const won = await db
        .insert(diagramLocks)
        .values({ diagramId, userId, editorId: handoff, expiresAt })
        .onConflictDoUpdate({
            target: diagramLocks.diagramId,
            set: { userId, editorId: handoff, expiresAt },
            setWhere: sql`${diagramLocks.expiresAt} <= now() or (${diagramLocks.userId} = ${userId} and ${diagramLocks.editorId} = ${editorId})`,
        })
        .returning({ diagramId: diagramLocks.diagramId });
    return won.length > 0;
}

/** Lets go of a lock, if this editor holds it; says whether it did. */
export async function releaseLock(
    db: Db,
    diagramId: string,
    userId: string,
    editorId: string
): Promise<boolean> {
    const res = await db
        .delete(diagramLocks)
        .where(
            and(
                eq(diagramLocks.diagramId, diagramId),
                eq(diagramLocks.userId, userId),
                eq(diagramLocks.editorId, editorId)
            )
        );
    return (res.rowCount ?? 0) > 0;
}
