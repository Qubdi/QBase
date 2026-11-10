import { describe, expect, it } from 'vitest';
import { countLabel, formatWhen } from '../diagram-summary';

describe('formatWhen', () => {
    it('formats a valid date for the viewer', () => {
        const iso = '2025-03-01T10:00:00.000Z';
        expect(formatWhen(iso)).toBe(new Date(iso).toLocaleString());
    });

    it('shows a dash when the date is missing or broken', () => {
        expect(formatWhen(null)).toBe('—');
        expect(formatWhen(undefined)).toBe('—');
        expect(formatWhen('')).toBe('—');
        expect(formatWhen('not a date')).toBe('—');
    });
});

describe('countLabel', () => {
    it('pluralises', () => {
        expect(countLabel(0, 'table')).toBe('0 tables');
        expect(countLabel(1, 'table')).toBe('1 table');
        expect(countLabel(12, 'table')).toBe('12 tables');
        expect(countLabel(undefined, 'table')).toBe('0 tables');
    });
});
