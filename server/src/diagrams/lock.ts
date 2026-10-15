import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { diagramLocks, users } from '../db/schema.js';

/** How long a lock lasts without being renewed by its editor. */
export const LOCK_TTL_SECONDS = 90;

export type LockResult = { held: true } | { held: false; holder: string };

/**
 * Takes the edit lock of a diagram, or renews it when `editorId` already holds
 * it. Someone else's lock is only taken over once it has run out. The check and
 * the write are one statement, so two editors cannot both win.
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
                setWhere: sql`${diagramLocks.expiresAt} <= now() or (${diagramLocks.userId} = ${userId} and ${diagramLocks.editorId} = ${editorId})`,
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

/** Lets go of a lock, if this editor holds it. */
export async function releaseLock(
    db: Db,
    diagramId: string,
    userId: string,
    editorId: string
) {
    await db
        .delete(diagramLocks)
        .where(
            and(
                eq(diagramLocks.diagramId, diagramId),
                eq(diagramLocks.userId, userId),
                eq(diagramLocks.editorId, editorId)
            )
        );
}
