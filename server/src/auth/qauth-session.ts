import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import { cryptoBoxFor } from '../introspect/crypto-box.js';
import { isUniqueViolation } from '../lib/pg-errors.js';
import { hashToken } from '../share/tokens.js';
import {
    QauthError,
    type QauthClient,
    type QauthPerson,
    type QauthTokens,
} from './qauth.js';
import { destroySession } from './sessions.js';

// QBase in QAuth mode: what happens between QAuth saying who the person is and
// QBase's own session (see qauth.ts). QBase's roles stay QBase's.

/** how often a session asks QAuth whether the person is still signed in there */
export const QAUTH_CHECK_SECONDS = 5 * 60;

// the same lock the first-run sign-up takes, so two first sign-ins cannot both become admin
const FIRST_USER_LOCK = 7_301_001;

const PURPOSE = 'qauth-refresh';

export const sealRefresh = (config: Pick<Config, 'secretsKey'>, token: string): string =>
    cryptoBoxFor(config.secretsKey!, PURPOSE).encrypt(token);

export const openRefresh = (config: Pick<Config, 'secretsKey'>, sealed: string): string =>
    cryptoBoxFor(config.secretsKey!, PURPOSE).decrypt(sealed);

export type PersonResult =
    | { ok: true; userId: string; isActive: boolean }
    | { ok: false; error: 'account_exists' };

/**
 * The QBase account of a person QAuth vouches for: found by QAuth's person id;
 * else an existing local account with the same address that QAuth has
 * verified (linked, so its projects and diagrams carry over); else a new one.
 * The very first person to sign in becomes QBase's administrator, as the first
 * account of a local install does.
 */
export async function accountForPerson(
    db: Db,
    person: QauthPerson & { emailVerified: boolean }
): Promise<PersonResult> {
    try {
        return await db.transaction(async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(${FIRST_USER_LOCK})`);
            const bySub = (
                await tx.select().from(users).where(eq(users.qauthSub, person.id))
            )[0];
            if (bySub) {
                if (bySub.email !== person.email) {
                    // QAuth is where the address is kept; follow it unless another account holds it
                    const clash = (
                        await tx.select({ id: users.id }).from(users).where(eq(users.email, person.email))
                    )[0];
                    if (!clash) {
                        await tx.update(users).set({ email: person.email }).where(eq(users.id, bySub.id));
                    }
                }
                return { ok: true as const, userId: bySub.id, isActive: bySub.isActive };
            }
            const byEmail = (
                await tx.select().from(users).where(eq(users.email, person.email))
            )[0];
            if (byEmail) {
                // an unverified address is not proof of who holds it: do not hand an
                // existing account to whoever registered the address at QAuth first
                if (byEmail.qauthSub !== null || !person.emailVerified) {
                    return { ok: false as const, error: 'account_exists' as const };
                }
                await tx.update(users).set({ qauthSub: person.id }).where(eq(users.id, byEmail.id));
                return { ok: true as const, userId: byEmail.id, isActive: byEmail.isActive };
            }
            const anyone = await tx.select({ id: users.id }).from(users).limit(1);
            const [created] = await tx
                .insert(users)
                .values({
                    email: person.email,
                    passwordHash: null,
                    qauthSub: person.id,
                    isAdmin: anyone.length === 0,
                })
                .returning({ id: users.id, isActive: users.isActive });
            return { ok: true as const, userId: created.id, isActive: created.isActive };
        });
    } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, error: 'account_exists' };
        throw err;
    }
}

/** QAuth's error, as the answer QBase's own sign-in screens already know how to show. */
export function replyForQauthError(reply: FastifyReply, err: unknown): FastifyReply {
    if (!(err instanceof QauthError)) throw err;
    if (err.status === 0 || err.status >= 500) {
        return reply.code(503).send({ error: 'auth_unavailable' });
    }
    if (err.status === 429 || err.code === 'too_many_attempts' || err.code === 'account_locked') {
        if (err.retryAfter) reply.header('retry-after', err.retryAfter);
        return reply.code(429).send({ error: 'too_many_attempts' });
    }
    if (err.code === 'invalid_credentials' || err.code === 'invalid_token') {
        return reply.code(401).send({ error: 'invalid_credentials' });
    }
    return reply.code(err.status === 401 ? 401 : err.status === 404 ? 400 : err.status).send({ error: err.code });
}

/**
 * Whether the QAuth sign-in behind a QBase session is still alive, asked at
 * most every few minutes: a refresh (which also keeps that sign-in alive there).
 * QAuth saying no (signed out there, password changed, person disabled) ends the
 * session here too. Being unable to ask changes nothing: QBase stays usable
 * while QAuth is down, and asks again on the next request.
 */
export async function qauthSessionAlive(
    db: Db,
    config: Config,
    qauth: QauthClient,
    token: string,
    ip: string
): Promise<boolean> {
    const id = hashToken(token);
    const [row] = await db
        .select({ sealed: sessions.idpRefreshEnc, checked: sessions.idpCheckedAt })
        .from(sessions)
        .where(eq(sessions.id, id));
    if (!row || !row.sealed) return true; // not a QAuth session (a local one)
    const due = !row.checked || Date.now() - row.checked.getTime() >= QAUTH_CHECK_SECONDS * 1000;
    if (!due) return true;
    try {
        const tokens = await qauth.refresh(openRefresh(config, row.sealed), ip);
        // one request writes: the others that saw it due find it already done
        await db
            .update(sessions)
            .set({
                idpCheckedAt: sql`now()`,
                ...(tokens.refreshToken ? { idpRefreshEnc: sealRefresh(config, tokens.refreshToken) } : {}),
            })
            .where(
                and(
                    eq(sessions.id, id),
                    or(
                        isNull(sessions.idpCheckedAt),
                        lt(sessions.idpCheckedAt, sql`now() - make_interval(secs => ${QAUTH_CHECK_SECONDS})`)
                    )
                )
            );
        return true;
    } catch (err) {
        if (err instanceof QauthError && err.refused) {
            await destroySession(db, token);
            return false;
        }
        return true;
    }
}

/** A fresh QAuth access token for the person behind a session (to call QAuth for them), or null. */
export async function qauthAccessFor(
    db: Db,
    config: Config,
    qauth: QauthClient,
    token: string,
    ip: string
): Promise<QauthTokens | null> {
    const [row] = await db
        .select({ sealed: sessions.idpRefreshEnc })
        .from(sessions)
        .where(eq(sessions.id, hashToken(token)));
    if (!row?.sealed) return null;
    const tokens = await qauth.refresh(openRefresh(config, row.sealed), ip);
    if (tokens.refreshToken) {
        await db
            .update(sessions)
            .set({ idpRefreshEnc: sealRefresh(config, tokens.refreshToken), idpCheckedAt: sql`now()` })
            .where(eq(sessions.id, hashToken(token)));
    }
    return tokens;
}
