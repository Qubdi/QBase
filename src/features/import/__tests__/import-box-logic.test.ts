import { describe, expect, it } from 'vitest';
import { blank, NOW, withTables } from '@/core/testing/helpers';
import { analyzeImport, listProblems } from '../analyze-import';
import { methodForPaste, methodsFor, prettyJson } from '../import-method';
import { mergeImported, IMPORT_GAP } from '../merge-into-design';
import { defaultSelection, PICKER_LIMIT } from '../picker-rows';
import type { PickerRow } from '../picker-rows';

describe('import box: which method a paste belongs to (IMP-006)', () => {
    it('DBML keywords switch to DBML', () => {
        expect(methodForPaste('Table users {\n id int [pk]\n}')).toBe('dbml');
        expect(methodForPaste('Ref: a.b > c.d')).toBe('dbml');
        expect(methodForPaste('id int [pk]')).toBe('dbml');
    });
    it('SQL statements switch to the SQL method', () => {
        expect(methodForPaste('create table t (id int);')).toBe('sql');
        expect(methodForPaste('CREATE UNIQUE INDEX i ON t (a)')).toBe('sql');
    });
    it('a JSON object or array switches to the query method', () => {
        expect(methodForPaste('{"a": 1}')).toBe('metadata');
        expect(methodForPaste(' [1, 2] ')).toBe('metadata');
    });
    it('anything else changes nothing', () => {
        expect(methodForPaste('hello')).toBeUndefined();
    });
    it('pretty prints JSON under 2 MB and leaves other text alone', () => {
        expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
        expect(prettyJson('not json')).toBe('not json');
        expect(prettyJson(`"${'x'.repeat(2 * 1024 * 1024)}"`)).toHaveLength(
            2 * 1024 * 1024 + 2
        );
    });
    it('offers SQL only where a reader exists', () => {
        expect(methodsFor('postgresql')).toEqual(['metadata', 'sql', 'dbml']);
        expect(methodsFor('generic')).toContain('sql');
        expect(methodsFor('oracle')).not.toContain('sql');
        expect(methodsFor('mysql', ['dbml'])).toEqual(['dbml']);
    });
});

describe('import box: reading the text (IMP-007, IMP-009 to IMP-012, IMP-015)', () => {
    const options = { databaseType: 'postgresql' as const };
    it('empty text says nothing and blocks nothing', async () => {
        const a = await analyzeImport('   ', { ...options, method: 'sql' });
        expect(a.diagnostics).toEqual([]);
        expect(a.blocked).toBe(false);
        expect(a.design).toBeUndefined();
    });
    it('SQL gives a design with counts', async () => {
        const a = await analyzeImport(
            'CREATE TABLE a (id int primary key);\nCREATE TABLE b (id int primary key, a_id int references a(id));',
            { ...options, method: 'sql' }
        );
        expect(a.blocked).toBe(false);
        expect(a.counts.tables).toBe(2);
        expect(a.counts.relationships).toBe(1);
        expect(a.design?.entities.order).toHaveLength(2);
    });
    it('a broken parenthesis blocks the import', async () => {
        const a = await analyzeImport('CREATE TABLE a (id int;', {
            ...options,
            method: 'sql',
        });
        expect(a.blocked).toBe(true);
        expect(a.design).toBeUndefined();
    });
    it('DBML gives tables and a relationship', async () => {
        const a = await analyzeImport(
            'Table a {\n id int [pk]\n}\nTable b {\n id int [pk]\n a_id int\n}\nRef: b.a_id > a.id',
            { ...options, method: 'dbml' }
        );
        expect(a.blocked).toBe(false);
        expect(a.counts).toMatchObject({ tables: 2, relationships: 1 });
    });
    it('a DBML syntax error blocks and names no design', async () => {
        const a = await analyzeImport('Table {', {
            ...options,
            method: 'dbml',
        });
        expect(a.blocked).toBe(true);
    });
    it('text that is not the metadata document is refused with one message', async () => {
        const a = await analyzeImport('hello', {
            ...options,
            method: 'metadata',
        });
        expect(a.blocked).toBe(true);
        expect(a.diagnostics).toHaveLength(1);
    });
    it('lists three problems, then how many more', () => {
        const many = Array.from({ length: 5 }, (_, i) => ({
            severity: 'error' as const,
            message: `e${i}`,
        }));
        const warn = { severity: 'warning' as const, message: 'w' };
        const r = listProblems([warn, ...many]);
        expect(r.shown.map((d) => d.message)).toEqual(['e0', 'e1', 'e2']);
        expect(r.more).toBe(2);
    });
});

describe('table picker defaults (IMP-064)', () => {
    it('starts with every table but no view, at most 500', () => {
        const rows: PickerRow[] = [
            ...Array.from({ length: 600 }, (_, i) => ({
                key: `s.t${i}`,
                schema: 's',
                name: `t${i}`,
                view: false,
            })),
            { key: 's.v', schema: 's', name: 'v', view: true },
        ];
        const picked = defaultSelection(rows);
        expect(picked.size).toBe(PICKER_LIMIT);
        expect(picked.has('s.v')).toBe(false);
    });
});

describe('import into the open diagram (IMP-075, IMP-076)', () => {
    it('places new tables 150 px right of the right-most existing one', () => {
        const current = withTables(['a', 'b']);
        const imported = withTables(['c']);
        const widest = Math.max(
            ...current.entities.order.map(
                (id) =>
                    current.entities.byId[id].x +
                    (current.entities.byId[id].width ?? 224)
            )
        );
        const result = mergeImported(current, imported, NOW);
        const added = result.design.entities.byId[imported.entities.order[0]];
        expect(added.x).toBe(widest + IMPORT_GAP);
        expect(result.addedEntities).toBe(1);
        expect(result.design.entities.order).toHaveLength(3);
    });
    it('reports a table that exists again and adds it anyway', () => {
        const current = withTables(['users']);
        const result = mergeImported(current, withTables(['Users']), NOW);
        expect(result.duplicates).toEqual(['public.Users']);
        expect(result.design.entities.order).toHaveLength(2);
    });
    it('a generic diagram takes the imported database type', () => {
        const generic = blank('generic');
        const result = mergeImported(
            generic,
            withTables(['x'], 'postgresql'),
            NOW
        );
        expect(result.design.databaseType).toBe('postgresql');
        const typed = mergeImported(
            withTables(['y'], 'mysql'),
            withTables(['x'], 'postgresql'),
            NOW
        );
        expect(typed.design.databaseType).toBe('mysql');
    });
});
