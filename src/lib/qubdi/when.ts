import { format, register } from 'timeago.js';
import { i18n } from '@/i18n/i18n';

const UNITS = ['second', 'minute', 'hour', 'day', 'week', 'month', 'year'];

const t = (key: string, options?: Record<string, unknown>) =>
    i18n.t(`qubdi.adminProjects.ago.${key}`, options);

// The words timeago.js puts around a number, taken from the translations when
// the time is written (not when this file loads), so a language change applies.
register('qubdi', (diff, idx) => {
    if (idx === 0) return [t('justNow'), t('rightNow')];
    const unit = t(UNITS[Math.floor(idx / 2)], { count: diff });
    return [t('past', { unit }), t('future', { unit })];
});

/** "3 hours ago", "just now": for a time that is shown next to its exact value. */
export const ago = (iso: string, now: Date = new Date()): string =>
    format(new Date(iso), 'qubdi', { relativeDate: now });

/** The exact time in the viewer's own format, for a tooltip. */
export const exactTime = (iso: string): string =>
    new Date(iso).toLocaleString();
