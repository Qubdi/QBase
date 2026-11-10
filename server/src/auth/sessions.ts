import { randomBytes } from 'node:crypto';
import { and, eq, gt, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { hashToken } from '../share/tokens.js';
import { diagramLocks, sessions, users } from '../db/schema.js';

export const SESSION_COOKIE = 'qbase_session';

/**
 * The session cookie's name over https. The `__Host-` prefix makes a browser
 * refuse the cookie unless it is Secure, set with Path=/ and has no Domain, so
 * another site on a sibling subdomain cannot plant or replace it.
 */
export const SECURE_SESSION_COOKIE = '__Host-qbase_session';

/**
 * The session token a request carries: under the prefixed name when it has
 * one, else under the plain name that every cookie issued before the prefix
 * (and every one issued over plain http) still has. The plain name can be
 * dropped from here once those sessions have all expired (SESSION_DAYS).
 */
export const sessionTokenOf = (
    cookies: Record<string, string | undefined> | undefined
): string | undefined =>
    cookies?.[SECURE_SESSION_COOKIE] ?? cookies?.[SESSION_COOKIE];

/** A session's last_seen_at is rewritten at most this often, not on every request. */
export const LAST_SEEN_SECONDS = 5 * 60;

/** The User-Agent kept per session; the column refuses anything longer. */
export const MAX_USER_AGENT_LENGTH = 200;

const keepUserAgent = (userAgent: string | undefined) =>
    userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null;

export interface SessionUser {
    id: string;
    email: string;
    isAdmin: boolean;
    /** the password is a temporary one: only changing it is allowed until then */
    mustChangePassword: boolean;
    /** two-factor sign-in is on for this account */
    mfaEnabled: boolean;
}

/**
 * Starts a session. A user has one live session at a time: signing in ends
 * every other session of the account, and lets go of the diagrams it was editing.
 * It also records the sign-in on the user (last_login_at) and the browser's
 * User-Agent on the session.
 */
export async function createSession(
    db: Db,
    userId: string,
    days: number,
    userAgent?: string
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
        await tx.update(users).set({ lastLoginAt: sql`now()` }).where(eq(users.id, userId));
        await tx.insert(sessions).values({
            id: hashToken(token),
            userId,
            expiresAt,
            userAgent: keepUserAgent(userAgent),
        });
    });
    return { token, expiresAt };
}

export async function getSessionUser(
    db: Db,
    token: string | undefined,
    /** a session unused this long is over, however far off its expiry is; 0 = no limit */
    idleSeconds = 0
): Promise<SessionUser | null> {
    if (!token) return null;
    const id = hashToken(token);
    // decided by the database's clock, in the same query that finds the session
    const stale = sql`${sessions.lastSeenAt} < now() - make_interval(secs => ${LAST_SEEN_SECONDS})`;
    const rows = await db
        .select({
            id: users.id,
            email: users.email,
            isAdmin: users.isAdmin,
            mustChangePassword: users.mustChangePassword,
            mfaEnabledAt: users.mfaEnabledAt,
            seenLongAgo: sql<boolean>`${stale}`,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
            and(
                eq(sessions.id, id),
                gt(sessions.expiresAt, new Date()),
                eq(users.isActive, true),
                idleSeconds > 0
                    ? sql`${sessions.lastSeenAt} > now() - make_interval(secs => ${idleSeconds})`
                    : undefined
            )
        );
    const row = rows[0];
    if (!row) return null;
    if (row.seenLongAgo) {
        // The condition is repeated so that requests arriving together write once.
        // Failing to note when a session was last used must not fail the request.
        await db
            .update(sessions)
            .set({ lastSeenAt: sql`now()` })
            .where(and(eq(sessions.id, id), stale))
            .catch(() => undefined);
    }
    return {
        id: row.id,
        email: row.email,
        isAdmin: row.isAdmin,
        mustChangePassword: row.mustChangePassword,
        mfaEnabled: row.mfaEnabledAt !== null,
    };
}

export async function destroySession(db: Db, token: string | undefined) {
    if (!token) return;
    // the session and the locks go together: if letting go of the locks fails,
    // the person is still signed in and can try again, rather than signed out
    // with diagrams still held
    await db.transaction(async (tx) => {
        const ended = await tx
            .delete(sessions)
            .where(eq(sessions.id, hashToken(token)))
            .returning({ userId: sessions.userId });
        // signing out lets go of the diagrams the user was editing
        for (const { userId } of ended) {
            await tx.delete(diagramLocks).where(eq(diagramLocks.userId, userId));
        }
    });
}

/**
 * Drop every session of a user except the one identified by `exceptToken`.
 * Returns how many live sessions it ended (one that had already expired and
 * was waiting for the purge does not count), so a caller can tell "signed
 * out" from "was not signed in".
 */
export async function destroyOtherSessions(
    db: Db,
    userId: string,
    exceptToken: string | undefined
): Promise<number> {
    const condition = exceptToken
        ? and(
              eq(sessions.userId, userId),
              ne(sessions.id, hashToken(exceptToken))
          )
        : eq(sessions.userId, userId);
    const ended = await db
        .delete(sessions)
        .where(condition)
        .returning({ expiresAt: sessions.expiresAt });
    // nobody is left to renew the diagrams that user was editing
    if (!exceptToken) {
        await db.delete(diagramLocks).where(eq(diagramLocks.userId, userId));
    }
    const now = Date.now();
    return ended.filter((s) => s.expiresAt.getTime() > now).length;
}
