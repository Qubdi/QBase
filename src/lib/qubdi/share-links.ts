// How a share link reads in the admin pages. Plain functions, no React.

import type { AdminShareLink, ShareLinkStatus } from './api';
import { ago } from './when';

export const ACCESS_LABEL: Record<AdminShareLink['access'], string> = {
    anyone: 'Anyone with the link',
    signed_in: 'Signed-in users only',
    off: 'Switched off',
};

export const STATUS_LABEL: Record<ShareLinkStatus, string> = {
    active: 'Active',
    off: 'Off',
    expired: 'Expired',
    revoked: 'Revoked',
};

/** When a link stops (or stopped) working: "Expires in 3 days", "Revoked 2 hours ago". */
export function expiryText(
    link: Pick<AdminShareLink, 'expiresAt' | 'revokedAt'>,
    now: Date = new Date()
): string {
    if (link.revokedAt) return `Revoked ${ago(link.revokedAt, now)}`;
    if (!link.expiresAt) return 'Never expires';
    return Date.parse(link.expiresAt) <= now.getTime()
        ? `Expired ${ago(link.expiresAt, now)}`
        : `Expires ${ago(link.expiresAt, now)}`;
}

/**
 * A link that is off or expired can still be switched on or extended by the
 * diagram's editors; a revoked one cannot be undone. Only revoked is final.
 */
export const canRevoke = (link: Pick<AdminShareLink, 'status'>): boolean =>
    link.status !== 'revoked';
