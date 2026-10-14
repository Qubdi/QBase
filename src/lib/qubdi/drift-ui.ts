import type { DriftBadge, DriftItem, DriftSeverity } from './api';

export interface SchedulePreset {
    id: string;
    label: string;
    cron: string;
}

/** Common schedules; anything else is a custom cron expression (UTC). */
export const SCHEDULE_PRESETS: SchedulePreset[] = [
    { id: 'hourly', label: 'Every hour', cron: '0 * * * *' },
    { id: 'six', label: 'Every 6 hours', cron: '0 */6 * * *' },
    { id: 'daily', label: 'Every day at 03:00 UTC', cron: '0 3 * * *' },
    { id: 'weekly', label: 'Every Monday at 03:00 UTC', cron: '0 3 * * 1' },
];

export const presetIdOf = (cron: string): string =>
    SCHEDULE_PRESETS.find((p) => p.cron === cron.trim())?.id ?? 'custom';

/** Text for the navbar badge, or null when there is nothing to show. */
export function badgeLabel(badge: DriftBadge | null): string | null {
    if (!badge) return null;
    if (badge.status === 'error') return 'Check failed';
    const total =
        badge.counts.breaking + badge.counts.warning + badge.counts.info;
    return `Drift: ${total}`;
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

export const SEVERITY_LABEL: Record<DriftSeverity, string> = {
    breaking: 'Breaking',
    warning: 'Warning',
    info: 'Info',
};

export const SEVERITY_CLASS: Record<DriftSeverity | 'error', string> = {
    breaking: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    warning:
        'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
    info: 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
    error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};
