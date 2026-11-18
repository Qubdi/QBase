import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { diagramLocks, lockPokes, users } from '../db/schema.js';
import { emitLockEvent, type LockEvent } from '../events.js';
import { isForeignKeyViolation, isUniqueViolation } from '../lib/pg-errors.js';
import { HANDOFF_PREFIX, HANDOFF_SECONDS, reserveLock } from './lock.js';

/** How long a poke waits for the holder's answer. */
export const POKE_WAIT_SECONDS = 60;
/** How long after poking someone may poke the same diagram again, whatever the answer was. */
export const POKE_COOLDOWN_SECONDS = 5 * 60;
/** How long an answer is kept for a requester whose stream was down when it came. */
export const POKE_RESULT_SECONDS = 2 * 60;

export type SendPokeResult =
    /** nobody was editing after all: the lock is set aside for the requester */
    | { status: 'granted' }
    | {
          status: 'sent';
          pokeId: string;
          expiresAt: Date;
          /** the person asked, by email */
          holder: string;
      }
    | { status: 'cooldown'; retryAfterSeconds: number }
    /** another poke already waits for this diagram's holder */
    | { status: 'pending' }
    /** the lock is changing hands, or kept doing so while it was looked up */
    | { status: 'unavailable' };

const now = sql`now()`;
const inSeconds = (seconds: number) =>
    sql`now() + make_interval(secs => ${seconds})`;

/** Who holds the lock of a diagram right now, if anyone does. */
async function liveHolder(db: Db, diagramId: string) {
    const [row] = await db
        .select({
            userId: diagramLocks.userId,
            editorId: diagramLocks.editorId,
            email: users.email,
        })
        .from(diagramLocks)
        .innerJoin(users, eq(users.id, diagramLocks.userId))
        .where(
            and(
                eq(diagramLocks.diagramId, diagramId),
                gt(diagramLocks.expiresAt, now)
            )
        );
    return row ?? null;
}

/**
 * Asks whoever holds a diagram's lock to step out. Without a live holder there
 * is nobody to ask, so the requester simply gets the lock. Returns null when
 * the diagram is gone.
 */
export async function sendPoke(
    db: Db,
    diagramId: string,
    requester: { id: string; email: string },
    editorId: string
): Promise<SendPokeResult | null> {
    try {
        for (let attempt = 0; attempt < 2; attempt++) {
            const holder = await liveHolder(db, diagramId);
            if (holder?.editorId.startsWith(HANDOFF_PREFIX)) {
                // handed to someone whose page is about to claim it: already the
                // requester's own, or there is no open tab to ask
                return holder.userId === requester.id
                    ? { status: 'granted' }
                    : { status: 'unavailable' };
            }
            if (
                !holder ||
                (holder.userId === requester.id && holder.editorId === editorId)
            ) {
                // free (or already this editor's): the requester's page reloads
                // to show the latest copy, so the lock is kept for it, not for
                // the id this page has now
                if (await reserveLock(db, diagramId, requester.id, editorId)) {
                    return { status: 'granted' };
                }
                continue; // someone took it between the two reads: look again
            }

            const [last] = await db
                .select({
                    wait: sql<number>`ceil(extract(epoch from (${lockPokes.createdAt} + make_interval(secs => ${POKE_COOLDOWN_SECONDS}) - now())))::int`,
                })
                .from(lockPokes)
                .where(
                    and(
                        eq(lockPokes.diagramId, diagramId),
                        eq(lockPokes.requesterId, requester.id)
                    )
                )
                .orderBy(desc(lockPokes.createdAt))
                .limit(1);
            if (last && last.wait > 0) {
                return { status: 'cooldown', retryAfterSeconds: last.wait };
            }

            // a poke nobody answered in time no longer holds the place
            await db
                .update(lockPokes)
                .set({ status: 'expired' })
                .where(
                    and(
                        eq(lockPokes.diagramId, diagramId),
                        eq(lockPokes.status, 'pending'),
                        sql`${lockPokes.expiresAt} <= now()`
                    )
                );
            let poke: { id: string; expiresAt: Date };
            try {
                [poke] = await db
                    .insert(lockPokes)
                    .values({
                        diagramId,
                        requesterId: requester.id,
                        requesterEditorId: editorId,
                        holderId: holder.userId,
                        holderEditorId: holder.editorId,
                        expiresAt: inSeconds(POKE_WAIT_SECONDS),
                    })
                    .returning({
                        id: lockPokes.id,
                        expiresAt: lockPokes.expiresAt,
                    });
            } catch (err) {
                // the unique index lets one poke wait at a time
                if (isUniqueViolation(err)) return { status: 'pending' };
                throw err;
            }
            emitLockEvent({
                kind: 'poke',
                diagramId,
                toUser: holder.userId,
                toEditor: holder.editorId,
                pokeId: poke.id,
                from: requester.email,
                expiresAt: poke.expiresAt.toISOString(),
            });
            return {
                status: 'sent',
                pokeId: poke.id,
                expiresAt: poke.expiresAt,
                holder: holder.email,
            };
        }
        return { status: 'unavailable' };
    } catch (err) {
        // the diagram was deleted while this ran
        if (isForeignKeyViolation(err)) return null;
        throw err;
    }
}

export type AnswerPokeResult =
    | { status: 'ok' }
    /** no such poke, or it was not made to this editor */
    | { status: 'not_found' }
    /** it stopped waiting before the answer came */
    | { status: 'expired' }
    /** it has been answered already */
    | { status: 'answered' }
    /** the answerer no longer holds the lock, so there is nothing to hand over */
    | { status: 'lock_changed' };

/**
 * The holder's answer to a poke. Agreeing sets the lock aside for the
 * requester (see `reserveLock`) in the same statement that checks the holder
 * still has it, so nobody can slip in between; the requester's tab is then
 * told. Only the tab that was asked may answer.
 */
export async function answerPoke(
    db: Db,
    diagramId: string,
    pokeId: string,
    answerer: { id: string },
    editorId: string,
    accept: boolean
): Promise<AnswerPokeResult> {
    const outcome = await db.transaction(async (tx) => {
        const [poke] = await tx
            .select({
                requesterId: lockPokes.requesterId,
                requesterEditorId: lockPokes.requesterEditorId,
                holderId: lockPokes.holderId,
                holderEditorId: lockPokes.holderEditorId,
                status: lockPokes.status,
                over: sql<boolean>`${lockPokes.expiresAt} <= now()`,
            })
            .from(lockPokes)
            .where(
                and(eq(lockPokes.id, pokeId), eq(lockPokes.diagramId, diagramId))
            )
            .for('update');
        if (
            !poke ||
            poke.holderId !== answerer.id ||
            poke.holderEditorId !== editorId
        ) {
            return { status: 'not_found' } as const;
        }
        if (poke.status !== 'pending') {
            return {
                status: poke.status === 'expired' ? 'expired' : 'answered',
            } as const;
        }
        const close = (status: 'accepted' | 'declined' | 'expired') =>
            tx
                .update(lockPokes)
                .set({ status, answeredAt: now })
                .where(eq(lockPokes.id, pokeId));
        if (poke.over) {
            await close('expired');
            return { status: 'expired' } as const;
        }
        if (accept) {
            const moved = await tx
                .update(diagramLocks)
                .set({
                    userId: poke.requesterId,
                    editorId: `${HANDOFF_PREFIX}${pokeId}`,
                    expiresAt: inSeconds(HANDOFF_SECONDS),
                })
                .where(
                    and(
                        eq(diagramLocks.diagramId, diagramId),
                        eq(diagramLocks.userId, poke.holderId),
                        eq(diagramLocks.editorId, poke.holderEditorId),
                        gt(diagramLocks.expiresAt, now)
                    )
                )
                .returning({ diagramId: diagramLocks.diagramId });
            if (moved.length === 0) {
                await close('expired');
                return { status: 'lock_changed' } as const;
            }
        }
        await close(accept ? 'accepted' : 'declined');
        return { status: 'ok', poke } as const;
    });

    if (outcome.status !== 'ok') return { status: outcome.status };
    emitLockEvent({
        kind: 'poke-result',
        diagramId,
        toUser: outcome.poke.requesterId,
        toEditor: outcome.poke.requesterEditorId,
        pokeId,
        outcome: accept ? 'accepted' : 'declined',
    });
    return { status: 'ok' };
}

/**
 * The holder let go of the diagram while someone was waiting for its answer:
 * that is an answer too. The diagram is set aside for the one who waited, and
 * its tab is told. Called after a lock is released.
 */
export async function settlePokesOnRelease(
    db: Db,
    diagramId: string,
    holderId: string,
    holderEditorId: string
): Promise<void> {
    const left = await db
        .update(lockPokes)
        .set({ status: 'left', answeredAt: now })
        .where(
            and(
                eq(lockPokes.diagramId, diagramId),
                eq(lockPokes.holderId, holderId),
                eq(lockPokes.holderEditorId, holderEditorId),
                eq(lockPokes.status, 'pending')
            )
        )
        .returning({
            id: lockPokes.id,
            requesterId: lockPokes.requesterId,
            requesterEditorId: lockPokes.requesterEditorId,
        });
    for (const poke of left) {
        // unless someone took the free diagram in the meantime
        await db
            .insert(diagramLocks)
            .values({
                diagramId,
                userId: poke.requesterId,
                editorId: `${HANDOFF_PREFIX}${poke.id}`,
                expiresAt: inSeconds(HANDOFF_SECONDS),
            })
            .onConflictDoNothing();
        emitLockEvent({
            kind: 'poke-result',
            diagramId,
            toUser: poke.requesterId,
            toEditor: poke.requesterEditorId,
            pokeId: poke.id,
            outcome: 'left',
        });
    }
}

/**
 * What an editor that has just opened its stream may have missed: the poke
 * waiting for its answer, if it holds the lock, and the answer to its own
 * poke, if that came while it was away. Events are not replayed, so a stream
 * that dropped at the wrong moment would otherwise never hear them.
 */
export async function pokeSnapshot(
    db: Db,
    diagramId: string,
    userId: string,
    editorId: string
): Promise<LockEvent[]> {
    const events: LockEvent[] = [];

    const holder = await liveHolder(db, diagramId);
    if (holder && holder.userId === userId && holder.editorId === editorId) {
        const [waiting] = await db
            .select({
                id: lockPokes.id,
                expiresAt: lockPokes.expiresAt,
                from: users.email,
            })
            .from(lockPokes)
            .innerJoin(users, eq(users.id, lockPokes.requesterId))
            .where(
                and(
                    eq(lockPokes.diagramId, diagramId),
                    eq(lockPokes.holderId, userId),
                    eq(lockPokes.holderEditorId, editorId),
                    eq(lockPokes.status, 'pending'),
                    gt(lockPokes.expiresAt, now)
                )
            )
            .orderBy(desc(lockPokes.createdAt))
            .limit(1);
        if (waiting) {
            events.push({
                kind: 'poke',
                diagramId,
                toUser: userId,
                toEditor: editorId,
                pokeId: waiting.id,
                from: waiting.from,
                expiresAt: waiting.expiresAt.toISOString(),
            });
        }
    }

    const [answered] = await db
        .select({ id: lockPokes.id, status: lockPokes.status })
        .from(lockPokes)
        .where(
            and(
                eq(lockPokes.diagramId, diagramId),
                eq(lockPokes.requesterId, userId),
                eq(lockPokes.requesterEditorId, editorId),
                inArray(lockPokes.status, ['accepted', 'declined', 'left']),
                gt(
                    lockPokes.answeredAt,
                    sql`now() - make_interval(secs => ${POKE_RESULT_SECONDS})`
                )
            )
        )
        .orderBy(desc(lockPokes.answeredAt))
        .limit(1);
    if (answered) {
        events.push({
            kind: 'poke-result',
            diagramId,
            toUser: userId,
            toEditor: editorId,
            pokeId: answered.id,
            outcome: answered.status as 'accepted' | 'declined' | 'left',
        });
    }
    return events;
}
