import { i18n } from '@/i18n/i18n';
import type { DriftBadge, DriftItem, DriftSeverity } from './api';

/** Text for the navbar badge, or null when there is nothing to show. */
export function badgeLabel(badge: DriftBadge | null): string | null {
    if (!badge) return null;
    if (badge.status === 'error')
        return i18n.t('qubdi.database.drift.badgeFailed');
    const total =
        badge.counts.breaking + badge.counts.warning + badge.counts.info;
    return i18n.t('qubdi.database.drift.badge', { total });
}

export function badgeSeverity(
    badge: DriftBadge | null
): DriftSeverity | 'error' | null {
    if (!badge) return null;
    if (badge.status === 'error') return 'error';
    if (badge.counts.breaking > 0) return 'breaking';
    if (badge.counts.warning > 0) return 'warning';
    return 'info';
}

export interface SplitChanges {
    onlyInDatabase: DriftItem[];
    onlyInDiagram: DriftItem[];
    differs: DriftItem[];
}

/** The three lists of the report page, keeping the server's severity order. */
export function splitByCategory(items: DriftItem[]): SplitChanges {
    return {
        onlyInDatabase: items.filter((i) => i.category === 'only_in_database'),
        onlyInDiagram: items.filter((i) => i.category === 'only_in_diagram'),
        differs: items.filter((i) => i.category === 'differs'),
    };
}

export const severityLabel = (severity: DriftSeverity): string =>
    i18n.t(`qubdi.database.drift.severity.${severity}`);

export const SEVERITY_CLASS: Record<DriftSeverity | 'error', string> = {
    breaking: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    warning:
        'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
    info: 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
    error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};
