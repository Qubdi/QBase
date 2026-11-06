import { eq } from 'drizzle-orm';
import type { SessionUser } from '../auth/sessions.js';
import type { Db } from '../db/client.js';
import { shareLinks } from '../db/schema.js';
import { hashToken, isWellFormedToken } from './tokens.js';

export type ShareLinkRow = typeof shareLinks.$inferSelect;

export type LinkCheck =
    | { ok: true; link: ShareLinkRow }
    | { ok: false; reason: 'not_found' | 'login_required' };

/** Pure decision: can this link be used right now by this visitor? */
export function checkLinkUsable(
    link: ShareLinkRow | undefined,
    user: SessionUser | null,
    now: Date = new Date()
): LinkCheck {
    if (!link) return { ok: false, reason: 'not_found' };
    if (link.revokedAt) return { ok: false, reason: 'not_found' };
    if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) {
        return { ok: false, reason: 'not_found' };
    }
    if (link.access === 'off') return { ok: false, reason: 'not_found' };
    if (link.access === 'signed_in' && !user) {
        return { ok: false, reason: 'login_required' };
    }
    return { ok: true, link };
}

export async function resolveToken(
    db: Db,
    token: string,
    user: SessionUser | null
): Promise<LinkCheck> {
    if (!isWellFormedToken(token)) return { ok: false, reason: 'not_found' };
    const [link] = await db
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.tokenHash, hashToken(token)));
    return checkLinkUsable(link, user);
}

export async function resolveLinkById(
    db: Db,
    linkId: string,
    user: SessionUser | null
): Promise<LinkCheck> {
    const [link] = await db
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.id, linkId));
    return checkLinkUsable(link, user);
}
