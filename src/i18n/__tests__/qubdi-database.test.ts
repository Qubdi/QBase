import { describe, expect, it } from 'vitest';
import { i18n } from '@/i18n/i18n';
import { database } from '@/i18n/qubdi/database';

const leaves = (obj: object, prefix = ''): string[] =>
    Object.entries(obj).flatMap(([key, value]) =>
        typeof value === 'string'
            ? [`${prefix}${key}`]
            : leaves(value as object, `${prefix}${key}.`)
    );

describe('qubdi.database keys', () => {
    const keys = leaves(database);

    it('has keys', () => {
        expect(keys.length).toBeGreaterThan(100);
    });

    it('resolves every key to text', () => {
        for (const key of keys) {
            const full = `qubdi.database.${key}`;
            expect(i18n.exists(full), full).toBe(true);
            const text = i18n.t(full);
            expect(text, full).toBeTruthy();
            expect(text, full).not.toBe(full);
        }
    });

    it('interpolates values', () => {
        expect(
            i18n.t('qubdi.database.connections.editAria', { name: 'Prod' })
        ).toBe('Edit Prod');
        expect(i18n.t('qubdi.database.drift.badge', { total: 3 })).toBe(
            'Drift: 3'
        );
    });

    it('picks the plural form', () => {
        const tested = (count: number) =>
            i18n.t('qubdi.database.connections.tested', {
                database: 'shop',
                count,
            });
        expect(tested(1)).toBe('Connected to shop. Found 1 schema.');
        expect(tested(2)).toBe('Connected to shop. Found 2 schemas.');
        expect(i18n.t('qubdi.database.importFromDb.tables', { count: 1 })).toBe(
            '1 table'
        );
        expect(i18n.t('qubdi.database.importFromDb.views', { count: 3 })).toBe(
            ' and 3 views'
        );
    });
});
