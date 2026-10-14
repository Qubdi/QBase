import { describe, expect, it } from 'vitest';
import {
    describeChange,
    describeRename,
    groupChanges,
    groupOf,
} from '../change-text';
import type { Change, PossibleRename } from '../../../../shared/reconcile';
import type { ColumnDesc, TableDesc } from '../../../../shared/schema-desc';

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
const table = (key: string, isView = false): TableDesc => ({
    key,
    schema: 'public',
    name: key.split('.')[1],
    isView,
    comment: null,
    columns: [],
    indexes: [],
});

describe('describeChange', () => {
    it('describes tables and views', () => {
        expect(
            describeChange({
                id: 'a',
                kind: 'table_added',
                table: table('public.users'),
            })
        ).toBe('Add table public.users');
        expect(
            describeChange({
                id: 'a',
                kind: 'table_removed',
                table: table('public.v', true),
            })
        ).toBe('Remove view public.v');
        expect(
            describeChange({
                id: 'a',
                kind: 'table_comment_changed',
                tableKey: 'public.users',
                from: null,
                to: 'x',
            })
        ).toBe('Change description of public.users');
    });

    it('describes columns with their type and each attribute change', () => {
        expect(
            describeChange({
                id: 'a',
                kind: 'column_added',
                tableKey: 'public.users',
                column: col('phone', { type: 'varchar' }),
            })
        ).toBe('Add column public.users.phone (varchar)');
        expect(
            describeChange({
                id: 'a',
                kind: 'column_removed',
                tableKey: 'public.users',
                column: col('phone'),
            })
        ).toBe('Remove column public.users.phone');
        const changed: Change = {
            id: 'a',
            kind: 'column_changed',
            tableKey: 'public.users',
            before: col('email'),
            after: col('email', { type: 'varchar' }),
            changes: [
                { field: 'type', from: 'text', to: 'varchar' },
                { field: 'nullable', from: true, to: false },
                { field: 'default', from: null, to: "''" },
                { field: 'primaryKey', from: false, to: true },
                { field: 'unique', from: true, to: false },
                { field: 'identity', from: false, to: true },
                { field: 'length', from: null, to: '120' },
                { field: 'precision', from: 10, to: 12 },
                { field: 'scale', from: 2, to: 4 },
                { field: 'comment', from: 'a', to: 'b' },
            ],
        };
        expect(describeChange(changed)).toBe(
            "Change column public.users.email: type text → varchar, now NOT NULL, default none → '', now primary key, no longer unique, now auto-increment, length none → 120, precision 10 → 12, scale 2 → 4, description changed"
        );
    });

    it('describes indexes and relationships', () => {
        const index = { name: 'ix', unique: true, columns: ['a', 'b'] };
        expect(
            describeChange({
                id: 'a',
                kind: 'index_added',
                tableKey: 'public.t',
                index,
            })
        ).toBe('Add unique index ix on public.t (a, b)');
        expect(
            describeChange({
                id: 'a',
                kind: 'index_removed',
                tableKey: 'public.t',
                index: { ...index, unique: false },
            })
        ).toBe('Remove index ix on public.t (a, b)');
        const relationship = {
            name: 'fk',
            fromTable: 'public.o',
            fromColumns: ['uid'],
            toTable: 'public.u',
            toColumns: ['id'],
        };
        expect(
            describeChange({
                id: 'a',
                kind: 'relationship_added',
                relationship,
            })
        ).toBe('Add relationship fk: public.o(uid) → public.u(id)');
        expect(
            describeChange({
                id: 'a',
                kind: 'relationship_removed',
                relationship,
            })
        ).toBe('Remove relationship fk: public.o(uid) → public.u(id)');
        expect(
            describeChange({
                id: 'a',
                kind: 'relationship_changed',
                before: relationship,
                after: { ...relationship, toTable: 'public.acct' },
            })
        ).toBe('Change relationship fk: now public.o(uid) → public.acct(id)');
    });
});

describe('describeRename', () => {
    it('words table and column renames', () => {
        const r: PossibleRename = {
            id: 'x',
            entity: 'table',
            tableKey: 'public.a',
            from: 'public.a',
            to: 'public.b',
            score: 0.9,
            followUps: [],
        };
        expect(describeRename(r)).toMatch(
            /^Rename table public\.a → public\.b/
        );
        expect(
            describeRename({
                ...r,
                entity: 'column',
                tableKey: 'public.a',
                from: 'x',
                to: 'y',
            })
        ).toBe('Rename column public.a.x → y');
    });
});

describe('grouping', () => {
    it('maps kinds to checklist groups', () => {
        expect(groupOf('table_added')).toBe('Tables');
        expect(groupOf('table_comment_changed')).toBe('Tables');
        expect(groupOf('column_changed')).toBe('Columns');
        expect(groupOf('index_removed')).toBe('Indexes');
        expect(groupOf('relationship_changed')).toBe('Relationships');
    });

    it('keeps a stable group order and drops empty groups', () => {
        const changes: Change[] = [
            {
                id: '1',
                kind: 'relationship_added',
                relationship: {
                    name: 'f',
                    fromTable: 'a',
                    fromColumns: ['x'],
                    toTable: 'b',
                    toColumns: ['y'],
                },
            },
            { id: '2', kind: 'table_added', table: table('public.t') },
            {
                id: '3',
                kind: 'column_added',
                tableKey: 'public.t',
                column: col('c'),
            },
        ];
        expect(groupChanges(changes).map((g) => g.group)).toEqual([
            'Tables',
            'Columns',
            'Relationships',
        ]);
        expect(groupChanges([])).toEqual([]);
    });
});
