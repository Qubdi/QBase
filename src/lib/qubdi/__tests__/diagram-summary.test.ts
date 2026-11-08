import { describe, expect, it } from 'vitest';
import { DatabaseEdition, DatabaseType } from '@/qbase/diagram-types';
import {
    countLabel,
    formatWhen,
    toDatabaseEdition,
    toDatabaseType,
} from '../diagram-summary';

describe('toDatabaseType', () => {
    it('accepts every database the editor knows', () => {
        for (const t of Object.values(DatabaseType)) {
            expect(toDatabaseType(t)).toBe(t);
        }
    });

    it('falls back to PostgreSQL for anything else', () => {
        expect(toDatabaseType(null)).toBe(DatabaseType.POSTGRESQL);
        expect(toDatabaseType(undefined)).toBe(DatabaseType.POSTGRESQL);
        expect(toDatabaseType('')).toBe(DatabaseType.POSTGRESQL);
        expect(toDatabaseType('db2')).toBe(DatabaseType.POSTGRESQL);
    });
});

describe('toDatabaseEdition', () => {
    it('accepts known editions and drops the rest', () => {
        expect(toDatabaseEdition('supabase')).toBe(
            DatabaseEdition.POSTGRESQL_SUPABASE
        );
        expect(toDatabaseEdition('nope')).toBeUndefined();
        expect(toDatabaseEdition(null)).toBeUndefined();
        expect(toDatabaseEdition('')).toBeUndefined();
    });
});

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
