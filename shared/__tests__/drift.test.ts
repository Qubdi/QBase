import { describe, expect, it } from 'vitest';
import {
    classifyChange,
    countBySeverity,
    driftSignature,
    renameHints,
    toDriftItems,
    worstSeverity,
} from '../drift';
import type { Change, PossibleRename } from '../reconcile';
import type { ColumnDesc, TableDesc } from '../schema-desc';

const col = (name: string, over: Partial<ColumnDesc> = {}): ColumnDesc => ({
    name,
    type: 'text',
    nullable: true,
    primaryKey: false,
    unique: false,
    default: null,
    length: null,
    precision: null,
    scale: null,
    identity: false,
    comment: null,
    ...over,
});
const table = (key: string): TableDesc => ({
    key,
    schema: 'public',
    name: key.split('.')[1],
    isView: false,
    comment: null,
    columns: [],
    indexes: [],
});
const added = (column: ColumnDesc): Change => ({
    id: `column_added:public.t.${column.name}`,
    kind: 'column_added',
    tableKey: 'public.t',
    column,
});
const changed = (
    fields: Array<{ field: never; from: unknown; to: unknown }>
): Change => ({
    id: 'column_changed:public.t.c',
    kind: 'column_changed',
    tableKey: 'public.t',
    before: col('c'),
    after: col('c'),
    changes: fields as never,
});
const ch = (field: string, from: unknown = 'a', to: unknown = 'b') => ({
    field: field as never,
    from,
    to,
});

describe('classifyChange: the spec severities', () => {
    it('a dropped column is breaking and only in the diagram', () => {
        expect(
            classifyChange({
                id: 'x',
                kind: 'column_removed',
                tableKey: 'public.t',
                column: col('c'),
            })
        ).toEqual({
            category: 'only_in_diagram',
            severity: 'breaking',
        });
    });

    it('a retyped column is breaking and differs', () => {
        expect(
            classifyChange(changed([ch('type', 'text', 'integer')]))
        ).toEqual({ category: 'differs', severity: 'breaking' });
        // even together with harmless changes
        expect(
            classifyChange(changed([ch('comment'), ch('type')])).severity
        ).toBe('breaking');
    });

    it('a new nullable column is a warning and only in the database', () => {
        expect(classifyChange(added(col('c', { nullable: true })))).toEqual({
            category: 'only_in_database',
            severity: 'warning',
        });
    });

    it('a changed comment or default is only information', () => {
        expect(classifyChange(changed([ch('comment')]))).toEqual({
            category: 'differs',
            severity: 'info',
        });
        expect(classifyChange(changed([ch('default')])).severity).toBe('info');
        expect(
            classifyChange(changed([ch('comment'), ch('default')])).severity
        ).toBe('info');
        expect(
            classifyChange({
                id: 'x',
                kind: 'table_comment_changed',
                tableKey: 'public.t',
                from: null,
                to: 'x',
            })
        ).toEqual({
            category: 'differs',
            severity: 'info',
        });
    });
});

describe('classifyChange: the rest', () => {
    it('a new required column without a default is breaking, with one it is a warning', () => {
        expect(
            classifyChange(added(col('c', { nullable: false }))).severity
        ).toBe('breaking');
        expect(
            classifyChange(added(col('c', { nullable: false, default: '0' })))
                .severity
        ).toBe('warning');
        expect(
            classifyChange(added(col('c', { nullable: false, identity: true })))
                .severity
        ).toBe('warning');
    });

    it('other attribute changes are warnings', () => {
        for (const f of [
            'nullable',
            'primaryKey',
            'unique',
            'identity',
            'length',
            'precision',
            'scale',
        ]) {
            expect(classifyChange(changed([ch(f)])).severity, f).toBe(
                'warning'
            );
        }
    });

    it('tables: new is information, dropped is breaking', () => {
        expect(
            classifyChange({
                id: 'x',
                kind: 'table_added',
                table: table('public.t'),
            })
        ).toEqual({ category: 'only_in_database', severity: 'info' });
        expect(
            classifyChange({
                id: 'x',
                kind: 'table_removed',
                table: table('public.t'),
            })
        ).toEqual({ category: 'only_in_diagram', severity: 'breaking' });
    });

    it('indexes and relationships', () => {
        const index = { name: 'i', unique: false, columns: ['a'] };
        expect(
            classifyChange({
                id: 'x',
                kind: 'index_added',
                tableKey: 't',
                index,
            }).severity
        ).toBe('info');
        expect(
            classifyChange({
                id: 'x',
                kind: 'index_removed',
                tableKey: 't',
                index,
            }).severity
        ).toBe('info');
        expect(
            classifyChange({
                id: 'x',
                kind: 'index_removed',
                tableKey: 't',
                index: { ...index, unique: true },
            }).severity
        ).toBe('warning');
        const relationship = {
            name: 'f',
            fromTable: 'a',
            fromColumns: ['x'],
            toTable: 'b',
            toColumns: ['y'],
        };
        expect(
            classifyChange({
                id: 'x',
                kind: 'relationship_added',
                relationship,
            })
        ).toEqual({ category: 'only_in_database', severity: 'info' });
        expect(
            classifyChange({
                id: 'x',
                kind: 'relationship_removed',
                relationship,
            })
        ).toEqual({ category: 'only_in_diagram', severity: 'warning' });
        expect(
            classifyChange({
                id: 'x',
                kind: 'relationship_changed',
                before: relationship,
                after: relationship,
            })
        ).toEqual({ category: 'differs', severity: 'warning' });
    });
});

describe('items, counts and signatures', () => {
    const changes: Change[] = [
        { id: 'b', kind: 'table_added', table: table('public.new') },
        {
            id: 'a',
            kind: 'column_removed',
            tableKey: 'public.t',
            column: col('c'),
        },
        added(col('z')),
        added(col('y')),
    ];

    it('sorts most serious first, then by id, and carries readable text', () => {
        const items = toDriftItems(changes);
        expect(items.map((i) => i.severity)).toEqual([
            'breaking',
            'warning',
            'warning',
            'info',
        ]);
        expect(items.map((i) => i.id)).toEqual([
            'a',
            'column_added:public.t.y',
            'column_added:public.t.z',
            'b',
        ]);
        expect(items[0].summary).toBe('Remove column public.t.c');
    });

    it('counts per severity and finds the worst', () => {
        const items = toDriftItems(changes);
        expect(countBySeverity(items)).toEqual({
            breaking: 1,
            warning: 2,
            info: 1,
        });
        expect(worstSeverity(items)).toBe('breaking');
        expect(worstSeverity([])).toBeNull();
        expect(
            worstSeverity([{ severity: 'info' }, { severity: 'warning' }])
        ).toBe('warning');
    });

    it('gives equal signatures to equal drift regardless of order, and different ones to different drift', () => {
        const items = toDriftItems(changes);
        expect(driftSignature(items)).toBe(
            driftSignature([...items].reverse())
        );
        expect(driftSignature(items)).not.toBe(driftSignature(items.slice(1)));
        expect(driftSignature([])).toBe('');
        // a change in severity is a different signature
        expect(driftSignature([{ id: 'x', severity: 'info' }])).not.toBe(
            driftSignature([{ id: 'x', severity: 'warning' }])
        );
    });

    it('words rename hints', () => {
        const r: PossibleRename[] = [
            {
                id: '1',
                entity: 'table',
                tableKey: 'public.a',
                from: 'public.a',
                to: 'public.b',
                score: 1,
                followUps: [],
            },
            {
                id: '2',
                entity: 'column',
                tableKey: 'public.a',
                from: 'x',
                to: 'y',
                score: 1,
                followUps: [],
            },
        ];
        expect(renameHints(r)).toEqual([
            'public.a may have been renamed to public.b',
            'public.a.x may have been renamed to y',
        ]);
    });
});
