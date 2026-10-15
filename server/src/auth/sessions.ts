import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, ne } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { diagramLocks, sessions, users } from '../db/schema.js';

export const SESSION_COOKIE = 'qubdidb_session';

export interface SessionUser {
    id: string;
    email: string;
    isAdmin: boolean;
}

const hashToken = (token: string) =>
    createHash('sha256').update(token).digest('hex');

/**
 * Starts a session. A user has one live session at a time: signing in ends
 * every other session of the account, and lets go of the diagrams it was editing.
 */
export async function createSession(
    db: Db,
    userId: string,
    days: number
): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + days * 86_400_000);
    await db.transaction(async (tx) => {
        // two sign-ins at once take turns, so exactly one session survives
        await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, userId))
            .for('update');
        await tx.delete(sessions).where(eq(sessions.userId, userId));
        await tx.delete(diagramLocks).where(eq(diagramLocks.userId, userId));
        await tx
            .insert(sessions)
            .values({ id: hashToken(token), userId, expiresAt });
    });
    return { token, expiresAt };
}

export async function getSessionUser(
    db: Db,
    token: string | undefined
): Promise<SessionUser | null> {
    if (!token) return null;
    const rows = await db
        .select({ id: users.id, email: users.email, isAdmin: users.isAdmin })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
            and(
                eq(sessions.id, hashToken(token)),
                gt(sessions.expiresAt, new Date()),
                eq(users.isActive, true)
            )
        );
    return rows[0] ?? null;
}

export async function destroySession(db: Db, token: string | undefined) {
    if (!token) return;
    const ended = await db
        .delete(sessions)
        .where(eq(sessions.id, hashToken(token)))
        .returning({ userId: sessions.userId });
    // signing out lets go of the diagrams the user was editing
    for (const { userId } of ended) {
        await db.delete(diagramLocks).where(eq(diagramLocks.userId, userId));
    }
}

/** Drop every session of a user except the one identified by `exceptToken`. */
export async function destroyOtherSessions(
    db: Db,
    userId: string,
    exceptToken: string | undefined
) {
    const condition = exceptToken
        ? and(
              eq(sessions.userId, userId),
              ne(sessions.id, hashToken(exceptToken))
          )
        : eq(sessions.userId, userId);
    await db.delete(sessions).where(condition);
    // nobody is left to renew the diagrams that user was editing
    if (!exceptToken) {
        await db.delete(diagramLocks).where(eq(diagramLocks.userId, userId));
    }
}
