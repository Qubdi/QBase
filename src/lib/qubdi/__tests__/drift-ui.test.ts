import { describe, expect, it } from 'vitest';
import type { DriftBadge, DriftItem } from '../api';
import { isValidCronShape } from '../cron-shape';
import {
    SCHEDULE_PRESETS,
    badgeLabel,
    badgeSeverity,
    presetIdOf,
    splitByCategory,
} from '../drift-ui';

const badge = (
    counts: Partial<DriftBadge['counts']>,
    status: DriftBadge['status'] = 'drifted'
): DriftBadge => ({
    status,
    counts: { breaking: 0, warning: 0, info: 0, ...counts },
    reportId: 'r',
});
const item = (
    id: string,
    category: DriftItem['category'],
    severity: DriftItem['severity'] = 'info'
): DriftItem => ({ id, kind: 'x', category, severity, summary: id });

describe('schedule presets', () => {
    it('are all valid 5-field expressions with unique ids', () => {
        for (const p of SCHEDULE_PRESETS) {
            expect(isValidCronShape(p.cron), p.id).toBe(true);
        }
        expect(new Set(SCHEDULE_PRESETS.map((p) => p.id)).size).toBe(
            SCHEDULE_PRESETS.length
        );
    });

    it('recognise their own expression, ignoring spacing, and call everything else custom', () => {
        expect(presetIdOf('0 3 * * *')).toBe('daily');
        expect(presetIdOf('  0 * * * *  ')).toBe('hourly');
        expect(presetIdOf('*/7 * * * *')).toBe('custom');
        expect(presetIdOf('')).toBe('custom');
    });
});

describe('isValidCronShape', () => {
    it('accepts five fields and rejects anything else', () => {
        expect(isValidCronShape('*/5 * * * *')).toBe(true);
        expect(isValidCronShape(' 0   3 * *  1 ')).toBe(true);
        expect(isValidCronShape('* * * *')).toBe(false);
        expect(isValidCronShape('* * * * * *')).toBe(false);
        expect(isValidCronShape('')).toBe(false);
    });
});

describe('badge', () => {
    it('has no label or severity when there is nothing to show', () => {
        expect(badgeLabel(null)).toBeNull();
        expect(badgeSeverity(null)).toBeNull();
    });

    it('counts all changes and picks the worst severity', () => {
        expect(badgeLabel(badge({ warning: 2, info: 1 }))).toBe('Drift: 3');
        expect(badgeSeverity(badge({ warning: 2, info: 1 }))).toBe('warning');
        expect(badgeSeverity(badge({ breaking: 1, info: 5 }))).toBe('breaking');
        expect(badgeSeverity(badge({ info: 1 }))).toBe('info');
    });

    it('shows a failed check differently from drift', () => {
        expect(badgeLabel(badge({}, 'error'))).toBe('Check failed');
        expect(badgeSeverity(badge({}, 'error'))).toBe('error');
    });
});

describe('splitByCategory', () => {
    it('separates the three kinds of difference and keeps order', () => {
        const items = [
            item('a', 'only_in_database', 'warning'),
            item('b', 'differs', 'breaking'),
            item('c', 'only_in_diagram'),
            item('d', 'only_in_database'),
        ];
        const s = splitByCategory(items);
        expect(s.onlyInDatabase.map((i) => i.id)).toEqual(['a', 'd']);
        expect(s.onlyInDiagram.map((i) => i.id)).toEqual(['c']);
        expect(s.differs.map((i) => i.id)).toEqual(['b']);
        expect(splitByCategory([])).toEqual({
            onlyInDatabase: [],
            onlyInDiagram: [],
            differs: [],
        });
    });
});
