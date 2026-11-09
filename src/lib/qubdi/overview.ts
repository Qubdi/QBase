// What the admin Overview shows, and how its numbers and axis are written.
// Plain functions, no React.

import { i18n } from '@/i18n/i18n';
import { localeTag } from '@/i18n/locale-tag';
import type { AdminStats } from './api';
import { uiLocale } from '@/lib/qubdi/locale';

export type ActivityDay = AdminStats['activity']['days'][number];

/** The smallest top the chart's axis may have, so an empty week still has a scale. */
export const MIN_AXIS_MAX = 4;

const MANTISSAS = [1, 2, 4, 6, 8];

/**
 * The top of the chart's axis: the smallest clean number (4, 6, 8, 10, 20, 40,
 * 60, 80, 100, 200 ...) that holds `value`. Every one is even, so the middle
 * tick is a whole number too.
 */
export function niceCeil(value: number): number {
    const wanted = Math.max(value, MIN_AXIS_MAX);
    for (let power = 1; ; power *= 10) {
        for (const mantissa of MANTISSAS) {
            const candidate = mantissa * power;
            if (candidate >= wanted) return candidate;
        }
    }
}

export interface ChartScale {
    /** the value at the top of the plot */
    max: number;
    /** bottom, middle, top */
    ticks: [number, number, number];
}

export function scaleFor(values: number[]): ChartScale {
    const max = niceCeil(Math.max(0, ...values));
    return { max, ticks: [0, max / 2, max] };
}

/** A column's height as a share of the plot, 0 to 100. */
export const heightPercent = (value: number, scale: ChartScale): number =>
    scale.max === 0 ? 0 : Math.min(100, (value / scale.max) * 100);

/** The chosen language's number conventions; English when it names none. */
const numberLocale = (): string => localeTag(i18n.language) ?? 'en-US';

/** 1,284: a whole count written the way the chosen language writes it. */
export const formatNumber = (value: number): string =>
    value.toLocaleString(numberLocale());

/** 1,284 below ten thousand, then 12.9K and 4.2M: a tile's value or an axis tick. */
export function compactNumber(value: number): string {
    if (Math.abs(value) < 10_000) return formatNumber(value);
    return new Intl.NumberFormat(numberLocale(), {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value);
}

export interface DayLabel {
    /** "Mon" */
    weekday: string;
    /** "12 Oct" */
    date: string;
    /** "Mon 12 Oct 2026", for a tooltip and a table */
    full: string;
    isToday: boolean;
}

/** Names a `YYYY-MM-DD` day the server sent. Built from its parts, so the viewer's zone cannot shift it. */
export function dayLabel(day: string, today: string): DayLabel {
    const [year, month, date] = day.split('-').map(Number);
    const when = new Date(year, month - 1, date);
    const part = (options: Intl.DateTimeFormatOptions) =>
        when.toLocaleDateString(uiLocale(), options);
    return {
        weekday: part({ weekday: 'short' }),
        date: part({ day: 'numeric', month: 'short' }),
        full: part({
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        }),
        isToday: day === today,
    };
}

/** The busiest day, or null when nothing happened in the whole week. */
export function busiestDay(days: ActivityDay[]): ActivityDay | null {
    let best: ActivityDay | null = null;
    for (const d of days) {
        if (d.events > 0 && (!best || d.events > best.events)) best = d;
    }
    return best;
}

/** The viewer's time zone, so a "day" on the chart is theirs; undefined if the browser will not say. */
export function viewerTimeZone(): string | undefined {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch {
        return undefined;
    }
}
