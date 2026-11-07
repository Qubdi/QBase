import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/i18n/i18n';
import { editorStrings } from '../register';

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory())
            return name === '__tests__' ? [] : walk(path);
        return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });

const leaves = (obj: object, prefix = ''): string[] =>
    Object.entries(obj).flatMap(([key, value]) =>
        typeof value === 'string'
            ? [`${prefix}${key}`]
            : leaves(value as object, `${prefix}${key}.`)
    );

describe('editor strings (SHL-099)', () => {
    it('every leaf resolves to text', () => {
        for (const key of leaves(editorStrings)) {
            const text = i18n.t(key, { count: 2 });
            expect(text, key).toBeTruthy();
            expect(text, key).not.toBe(key);
        }
    });

    it('every literal key used by the editor code exists', () => {
        const roots = [
            'src/workspace',
            'src/features/designs',
            'src/features/import',
            'src/features/export',
            'src/features/settings',
            'src/dialogs',
            'src/context/dialog-context',
        ];
        const missing: string[] = [];
        for (const root of roots) {
            for (const file of walk(root)) {
                const source = readFileSync(file, 'utf8');
                for (const [, key] of source.matchAll(
                    /'(editor\.[A-Za-z0-9_.]+)'/g
                )) {
                    if (!i18n.exists(key, { count: 2 }))
                        missing.push(`${file}: ${key}`);
                }
            }
        }
        expect(missing).toEqual([]);
    });

    it('keys built from a name have a text for every name', () => {
        const names: [string, string[]][] = [
            ['editor.importing.box.method', ['metadata', 'sql', 'dbml']],
            ['editor.importing.box.field', ['metadata', 'sql', 'dbml']],
            ['editor.importing.box.placeholder', ['metadata', 'sql', 'dbml']],
            [
                'editor.importing.box.editions',
                [
                    'supabase',
                    'timescale',
                    'mysql_5_7',
                    'sql_server_2016_and_below',
                    'cloudflare_d1',
                ],
            ],
            ['editor.settings.themes', ['system', 'light', 'dark']],
            ['editor.settings.wheelModes', ['pan', 'zoom']],
            ['editor.workspace.menu.view.themes', ['system', 'light', 'dark']],
            [
                'editor.workspace.rail',
                ['tables', 'dbml', 'refs', 'customTypes', 'visuals'],
            ],
            [
                'editor.workspace.drawer.entries',
                ['tables', 'dbml', 'refs', 'customTypes', 'areas', 'notes'],
            ],
            [
                'editor.workspace.shortcuts',
                [
                    'undo',
                    'redo',
                    'openDiagram',
                    'save',
                    'togglePanel',
                    'fitAll',
                    'toggleTheme',
                    'toggleFilter',
                    'copyTables',
                    'pasteTables',
                    'removeSelection',
                ],
            ],
        ];
        for (const [prefix, list] of names)
            for (const name of list)
                expect(
                    i18n.exists(`${prefix}.${name}`),
                    `${prefix}.${name}`
                ).toBe(true);
    });

    it('picks the plural form', () => {
        expect(i18n.t('editor.importing.into.newTables', { count: 1 })).toBe(
            '1 table will be added.'
        );
        expect(i18n.t('editor.importing.into.newTables', { count: 4 })).toBe(
            '4 tables will be added.'
        );
    });
});
