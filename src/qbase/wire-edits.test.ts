import { describe, expect, it } from 'vitest';
import type { DBIndex, DBTable } from './diagram-types';
import {
    columnPatchFromWire,
    entityPatchFromWire,
    keyFromIndex,
} from './wire-edits';

const index = (extra: Partial<DBIndex> = {}): DBIndex => ({
    id: 'i1',
    name: 'idx',
    fieldIds: ['a'],
    unique: false,
    createdAt: 5,
    ...extra,
});

describe('keyFromIndex', () => {
    it('keeps a known index method as the algorithm and drops an unknown one', () => {
        expect(keyFromIndex(index({ type: 'btree' })).algorithm).toBe('btree');
        expect(
            keyFromIndex(index({ type: 'not-a-method' as never }))
        ).not.toHaveProperty('algorithm');
    });

    it('marks the primary key and carries the comment as a note', () => {
        const key = keyFromIndex(
            index({ isPrimaryKey: true, comments: 'the key' })
        );
        expect(key.pk).toBe(true);
        expect(key.note).toBe('the key');
    });

    it('leaves out empty extras: no descending list, no blank predicate, no blank note', () => {
        const key = keyFromIndex(
            index({
                isPrimaryKey: false,
                descendingFieldIds: [],
                where: '',
                comments: '',
            })
        );
        expect(Object.keys(key).sort()).toEqual(
            ['distinct', 'id', 'label', 'madeAt', 'members'].sort()
        );
    });

    it('copies the field ids so the saved index and the key do not share an array', () => {
        const saved = index({
            fieldIds: ['a', 'b'],
            descendingFieldIds: ['b'],
        });
        const key = keyFromIndex(saved);
        key.members.push('c');
        key.descending!.push('a');
        expect(saved.fieldIds).toEqual(['a', 'b']);
        expect(saved.descendingFieldIds).toEqual(['b']);
    });
});

describe('columnPatchFromWire', () => {
    it('maps the plain keys one to one', () => {
        expect(
            columnPatchFromWire({
                name: 'email',
                primaryKey: false,
                unique: true,
                nullable: false,
            })
        ).toEqual({
            name: 'email',
            primaryKey: false,
            unique: true,
            nullable: false,
        });
    });

    it('takes only the id and name of a type', () => {
        const patch = columnPatchFromWire({
            type: { id: 'varchar', name: 'varchar', extra: 1 } as never,
        });
        expect(patch.type).toEqual({ id: 'varchar', name: 'varchar' });
    });

    it('ignores a type that is null rather than clearing it', () => {
        expect(columnPatchFromWire({ type: null as never })).toEqual({});
    });

    it('reads the length as a number, max, or nothing', () => {
        expect(
            columnPatchFromWire({ characterMaximumLength: '255' }).length
        ).toBe(255);
        expect(
            columnPatchFromWire({ characterMaximumLength: 'MAX' }).length
        ).toBe('max');
        const cleared = columnPatchFromWire({ characterMaximumLength: null });
        expect(cleared).toHaveProperty('length', undefined);
    });

    it('turns an unreadable length into no length', () => {
        const patch = columnPatchFromWire({
            characterMaximumLength: 'twelve',
        });
        expect(patch).toHaveProperty('length', undefined);
    });

    it('clears every optional key that is sent as null', () => {
        const patch = columnPatchFromWire({
            increment: null,
            isArray: null,
            precision: null,
            scale: null,
            default: null,
            collation: null,
            comments: null,
            check: null,
        } as never);
        expect(patch).toEqual({
            increment: undefined,
            isArray: undefined,
            precision: undefined,
            scale: undefined,
            default: undefined,
            collation: undefined,
            comments: undefined,
            check: undefined,
        });
        // the keys are there, so the edit clears them rather than leaving them
        expect(Object.keys(patch)).toHaveLength(8);
    });

    it('sets the optional keys that are sent with a value', () => {
        expect(
            columnPatchFromWire({
                increment: true,
                isArray: true,
                precision: 10,
                scale: 2,
                default: 'now()',
                collation: 'C',
                comments: 'hi',
                check: 'x > 0',
            })
        ).toEqual({
            increment: true,
            isArray: true,
            precision: 10,
            scale: 2,
            default: 'now()',
            collation: 'C',
            comments: 'hi',
            check: 'x > 0',
        });
    });

    it('a computed column is stored unless it says otherwise', () => {
        expect(
            columnPatchFromWire({ generatedExpression: 'a * 2' }).generated
        ).toEqual({ expression: 'a * 2', stored: true });
    });

    it('an empty patch changes nothing', () => {
        expect(columnPatchFromWire({})).toEqual({});
    });

    it('CLI-132: changing only whether a computed column is stored keeps its expression', () => {
        expect(
            columnPatchFromWire(
                { generatedStored: false },
                { generated: { expression: 'a + 1', stored: true } }
            )
        ).toEqual({ generated: { expression: 'a + 1', stored: false } });
    });

    it('CLI-140: a null generatedStored keeps whether the column is stored', () => {
        // the wire shape can carry null for a flag; there is nothing to flip
        expect(
            columnPatchFromWire(
                { generatedStored: null },
                { generated: { expression: 'a + 1', stored: false } }
            )
        ).toEqual({ generated: { expression: 'a + 1', stored: false } });
    });

    it('CLI-132: flipping generatedStored on a column that is not computed changes nothing', () => {
        expect(columnPatchFromWire({ generatedStored: false })).toEqual({});
        expect(columnPatchFromWire({ generatedStored: false }, {})).toEqual({});
    });
});

describe('entityPatchFromWire', () => {
    it('maps the table keys to the model', () => {
        expect(
            entityPatchFromWire({
                name: 'users',
                schema: 'app',
                x: 10,
                y: 20,
                color: '#fff',
                createdAt: 7,
                width: 300,
                comments: 'people',
                expanded: true,
                parentAreaId: 'r1',
            })
        ).toEqual({
            name: 'users',
            schema: 'app',
            x: 10,
            y: 20,
            color: '#fff',
            createdAt: 7,
            width: 300,
            comments: 'people',
            expanded: true,
            regionId: 'r1',
        });
    });

    it('turns isView into the kind, both ways', () => {
        expect(entityPatchFromWire({ isView: true }).kind).toBe('view');
        expect(entityPatchFromWire({ isView: false }).kind).toBe('table');
    });

    it('clears schema, materialized, width, comments, expanded and the area when sent as null', () => {
        const patch = entityPatchFromWire({
            schema: null,
            isMaterializedView: null,
            width: null,
            comments: null,
            expanded: null,
            parentAreaId: null,
        } as never);
        expect(patch).toEqual({
            schema: undefined,
            materialized: undefined,
            width: undefined,
            comments: undefined,
            expanded: undefined,
            regionId: undefined,
        });
        expect(Object.keys(patch)).toHaveLength(6);
    });

    it('keeps a materialized flag', () => {
        expect(
            entityPatchFromWire({ isMaterializedView: true }).materialized
        ).toBe(true);
    });

    it.each(['fields', 'indexes', 'checkConstraints', 'order'] as const)(
        'refuses to change "%s", which has its own operations',
        (key) => {
            expect(() =>
                entityPatchFromWire({ [key]: [] } as Partial<DBTable>)
            ).toThrow(`updateTable cannot change "${key}"`);
        }
    );

    it('an empty patch changes nothing', () => {
        expect(entityPatchFromWire({})).toEqual({});
    });
});
