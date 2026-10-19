// How a share link reads in the admin pages. Plain functions, no React.

import { i18n } from '@/i18n/i18n';
import type { AdminShareLink, ShareLinkStatus } from './api';
import { ago } from './when';

/** What the list needs of a link; the editor's and the admin's both have it. */
export interface ShareLinkFields {
    id: string;
    access: AdminShareLink['access'];
    live: boolean;
    expiresAt: string | null;
    createdAt: string;
    revokedAt: string | null;
    /** undefined when the list does not say who made it; null when that user is gone */
    createdByEmail?: string | null;
}

/**
 * What to call a link. The same order as the server's `linkStatus`: a revoked
 * link is revoked even if it also expired.
 */
export function linkStatus(
    link: Pick<ShareLinkFields, 'revokedAt' | 'expiresAt' | 'access'>,
    now: Date = new Date()
): ShareLinkStatus {
    if (link.revokedAt) return 'revoked';
    if (link.expiresAt && Date.parse(link.expiresAt) <= now.getTime()) {
        return 'expired';
    }
    if (link.access === 'off') return 'off';
    return 'active';
}

// Getters, so the text is looked up when it is read (in the current language)
// and not once when this module loads.
export const ACCESS_LABEL: Record<AdminShareLink['access'], string> = {
    get anyone() {
        return i18n.t('qubdi.workspace.shareLinks.access.anyone');
    },
    get signed_in() {
        return i18n.t('qubdi.workspace.shareLinks.access.signed_in');
    },
    get off() {
        return i18n.t('qubdi.workspace.shareLinks.access.off');
    },
};

export const STATUS_LABEL: Record<ShareLinkStatus, string> = {
    get active() {
        return i18n.t('qubdi.workspace.shareLinks.status.active');
    },
    get off() {
        return i18n.t('qubdi.workspace.shareLinks.status.off');
    },
    get expired() {
        return i18n.t('qubdi.workspace.shareLinks.status.expired');
    },
    get revoked() {
        return i18n.t('qubdi.workspace.shareLinks.status.revoked');
    },
};

/** When a link stops (or stopped) working: "Expires in 3 days", "Revoked 2 hours ago". */
export function expiryText(
    link: Pick<AdminShareLink, 'expiresAt' | 'revokedAt'>,
    now: Date = new Date()
): string {
    if (link.revokedAt) {
        return i18n.t('qubdi.workspace.shareLinks.expiry.revoked', {
            when: ago(link.revokedAt, now),
        });
    }
    if (!link.expiresAt) {
        return i18n.t('qubdi.workspace.shareLinks.expiry.never');
    }
    return i18n.t(
        Date.parse(link.expiresAt) <= now.getTime()
            ? 'qubdi.workspace.shareLinks.expiry.expired'
            : 'qubdi.workspace.shareLinks.expiry.expires',
        { when: ago(link.expiresAt, now) }
    );
}

/**
 * A link that is off or expired can still be switched on or extended by the
 * diagram's editors; a revoked one cannot be undone. Only revoked is final.
 */
export const canRevoke = (link: Pick<AdminShareLink, 'status'>): boolean =>
    link.status !== 'revoked';
