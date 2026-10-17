import { and, gt, isNull, ne, or, sql } from 'drizzle-orm';
import { shareLinks } from '../db/schema.js';
import type { ShareLinkRow } from './access.js';

/**
 * Whether a link can be opened at all right now: not revoked, not expired,
 * not switched off. This is the same rule `checkLinkUsable` applies to one
 * link in code, written as SQL so a count over many links (the admin pages) does
 * not load them; `test/share-active.test.ts` holds the two together.
 */
export const activeLinkSql = () =>
    and(
        isNull(shareLinks.revokedAt),
        ne(shareLinks.access, 'off'),
        or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, sql`now()`))
    );

export type LinkStatus = 'active' | 'off' | 'expired' | 'revoked';

/**
 * What to call a link, for a list. The order is the one `checkLinkUsable`
 * uses: a revoked link is revoked even if it also expired.
 */
export function linkStatus(
    link: Pick<ShareLinkRow, 'revokedAt' | 'expiresAt' | 'access'>,
    now: Date = new Date()
): LinkStatus {
    if (link.revokedAt) return 'revoked';
    if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) {
        return 'expired';
    }
    if (link.access === 'off') return 'off';
    return 'active';
}
