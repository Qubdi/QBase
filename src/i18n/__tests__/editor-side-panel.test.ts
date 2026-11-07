import { describe, expect, it } from 'vitest';
import { i18n } from '@/i18n/i18n';
import { sidePanelStrings } from '@/i18n/editor/side-panel';

const leaves = (obj: object, prefix = ''): string[] =>
    Object.entries(obj).flatMap(([key, value]) =>
        typeof value === 'string'
            ? [`${prefix}${key}`]
            : leaves(value as object, `${prefix}${key}.`)
    );

describe('editor.sidePanel keys', () => {
    it('every key resolves to its English text', () => {
        const keys = leaves(sidePanelStrings);
        expect(keys.length).toBeGreaterThan(150);
        for (const key of keys) {
            const full = `editor.sidePanel.${key}`;
            expect(i18n.exists(full), full).toBe(true);
            expect(
                i18n.t(full, {
                    count: 2,
                    key: 'Ctrl+V',
                    value: 'x',
                    name: 'n',
                }),
                full
            ).not.toBe(full);
        }
    });

    it('fills in values', () => {
        expect(
            i18n.t('editor.sidePanel.clipboard.copiedMany', { count: 3 })
        ).toBe('3 tables copied');
    });
});
