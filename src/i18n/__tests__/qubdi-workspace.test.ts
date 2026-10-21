import { describe, expect, it } from 'vitest';
import { i18n } from '@/i18n/i18n';
import { workspace } from '@/i18n/qubdi/workspace';

const leaves = (obj: object, prefix = ''): string[] =>
    Object.entries(obj).flatMap(([key, value]) =>
        typeof value === 'string'
            ? [`${prefix}${key}`]
            : leaves(value as object, `${prefix}${key}.`)
    );

describe('qubdi.workspace keys', () => {
    const keys = leaves(workspace);

    it('has keys', () => {
        expect(keys.length).toBeGreaterThan(100);
    });

    it('resolves every key to text', () => {
        for (const key of keys) {
            const full = `qubdi.workspace.${key}`;
            expect(i18n.exists(full), full).toBe(true);
            const text = i18n.t(full);
            expect(text, full).toBeTruthy();
            expect(text, full).not.toBe(full);
        }
    });

    it('interpolates values', () => {
        expect(
            i18n.t('qubdi.workspace.publishStatus.publishedChanges', {
                version: 4,
            })
        ).toBe('Published v4, unpublished changes');
        expect(
            i18n.t('qubdi.workspace.projectDiagrams.actionsFor', {
                title: 'Shop',
            })
        ).toBe('Actions for Shop');
    });

    it('picks the plural form', () => {
        const tables = (count: number) =>
            i18n.t('qubdi.workspace.diagramSummary.table', { count });
        expect(tables(1)).toBe('1 table');
        expect(tables(3)).toBe('3 tables');
        expect(
            i18n.t('qubdi.workspace.viewerNode.fieldCount', { count: 2 })
        ).toBe('2 fields');
    });
});
