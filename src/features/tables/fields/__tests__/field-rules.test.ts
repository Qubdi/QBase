import { describe, expect, it } from 'vitest';
import { applyOk, withTables } from '@/core/testing/helpers';
import { createColumn } from '@/core/model/defaults';
import type { Column } from '@/core/model/column';
import {
    fieldAttributeState,
    lengthModeOf,
    planPickType,
    reorderedIds,
} from '../field-rules';
import {
    filterTypeOptions,
    optionSuffix,
    readTypedDeclaration,
    typeOptions,
} from '../type-options';
import { lengthLimit, precisionRange, traitsOfType } from '../type-traits';

const col = (over: Partial<Column>): Column => ({
    ...createColumn({ databaseType: 'postgresql' }, 0, { now: 1 }),
    ...over,
});

describe('EDT-119 EDT-120 EDT-197 the type list', () => {
    it('puts common types first and the rest alphabetically', () => {
        const { standard } = typeOptions('postgresql');
        const names = standard.map((o) => o.ref.name);
        expect(names.slice(0, 3)).toEqual(['integer', 'bigint', 'varchar']);
        const rest = names.slice(11);
        expect([...rest].sort((a, b) => a.localeCompare(b))).toEqual(rest);
    });

    it('lists custom types apart, enums with their values', () => {
        const options = typeOptions('postgresql', [
            { id: 'u', name: 'mood', kind: 'enum', values: ['sad', 'ok'] },
        ]);
        expect(options.custom).toEqual([
            {
                ref: { id: 'mood', name: 'mood' },
                group: 'custom',
                description: 'sad | ok',
            },
        ]);
    });

    it('finds types by a part of the name, and reports none', () => {
        const options = typeOptions('mysql');
        expect(
            filterTypeOptions(options, 'VARC').standard.map((o) => o.ref.name)
        ).toContain('varchar');
        expect(filterTypeOptions(options, 'zzzz').standard).toEqual([]);
    });
});

describe('EDT-121 EDT-122 typed declarations', () => {
    const options = typeOptions('postgresql');

    it('reads varchar(255), numeric(10,2) and integer[]', () => {
        expect(
            readTypedDeclaration(options, 'varchar(255)')?.declaration
        ).toMatchObject({
            name: 'varchar',
            length: 255,
        });
        expect(
            readTypedDeclaration(options, 'numeric(10,2)')?.declaration
        ).toMatchObject({
            precision: 10,
            scale: 2,
        });
        expect(
            readTypedDeclaration(options, 'integer[]')?.declaration.isArray
        ).toBe(true);
    });

    it('ignores plain names, unknown types and nonsense', () => {
        expect(readTypedDeclaration(options, 'varchar')).toBeUndefined();
        expect(readTypedDeclaration(options, 'nosuch(3)')).toBeUndefined();
        expect(readTypedDeclaration(options, '(((')).toBeUndefined();
    });

    it('shows the size suffix on the option of the current type only', () => {
        const option = options.standard.find((o) => o.ref.id === 'varchar')!;
        const column = col({
            type: { id: 'varchar', name: 'varchar' },
            length: 40,
        });
        expect(optionSuffix(option, column, true)).toBe('(40)');
        expect(optionSuffix(options.standard[0], column, true)).toBe('');
    });
});

describe('EDT-123 EDT-124 picking a type', () => {
    const design = withTables(['t']);
    const entity = design.entities.byId[design.entities.order[0]];
    const column = design.columns[entity.columnIds[0]];
    const options = typeOptions('postgresql');
    const pick = (id: string) => options.standard.find((o) => o.ref.id === id)!;

    it('keeps the length for a character type and clears the default', () => {
        const start = applyOk(design, {
            type: 'part.update',
            entityId: entity.id,
            part: 'columns',
            id: column.id,
            patch: {
                type: { id: 'varchar', name: 'varchar' },
                length: 30,
                default: "'x'",
            },
        }).design;
        const current = start.columns[column.id];
        const next = applyOk(
            start,
            planPickType('postgresql', entity, current, pick('char'))
        ).design.columns[column.id];
        expect(next.length).toBe(30);
        expect(next.default).toBeUndefined();
        const text = applyOk(
            start,
            planPickType('postgresql', entity, current, pick('text'))
        ).design.columns[column.id];
        expect(text.length).toBeUndefined();
    });

    it('takes the sizes of a typed declaration', () => {
        const typed = readTypedDeclaration(options, 'numeric(10,2)')!;
        const next = applyOk(
            design,
            planPickType(
                'postgresql',
                entity,
                column,
                typed.option,
                typed.declaration
            )
        ).design.columns[column.id];
        expect([next.precision, next.scale]).toEqual([10, 2]);
    });

    it('makes a serial column not null with auto increment', () => {
        const next = applyOk(
            design,
            planPickType(
                'postgresql',
                entity,
                { ...column, nullable: true },
                pick('serial')
            )
        ).design.columns[column.id];
        expect(next.nullable).toBe(false);
        expect(next.increment).toBe(true);
    });
});

describe('EDT-125 to EDT-130 the attributes popover', () => {
    it('locks Unique for a lone primary key only', () => {
        const pk = col({ primaryKey: true, nullable: false });
        expect(fieldAttributeState('postgresql', pk, [pk]).uniqueLocked).toBe(
            true
        );
        const other = col({ primaryKey: true, nullable: false });
        expect(
            fieldAttributeState('postgresql', pk, [pk, other]).uniqueLocked
        ).toBe(false);
    });

    it('locks Allow null (and so the N toggle) for a key and for the serial family only', () => {
        const locked = (over: Partial<Column>) =>
            fieldAttributeState('postgresql', col(over), [col(over)])
                .nullableLocked;
        expect(locked({ primaryKey: true, nullable: false })).toBe(true);
        expect(
            locked({
                type: { id: 'serial', name: 'serial' },
                nullable: false,
            })
        ).toBe(true);
        expect(
            locked({
                type: { id: 'BIGSERIAL', name: 'bigserial' },
                nullable: false,
            })
        ).toBe(true);
        expect(locked({ nullable: true })).toBe(false);
        expect(locked({ nullable: false })).toBe(false);
        expect(
            locked({ type: { id: 'integer', name: 'integer' }, nullable: true })
        ).toBe(false);
    });

    it('offers Auto Increment for integer types, locked while nullable or serial', () => {
        const int = col({
            type: { id: 'integer', name: 'integer' },
            nullable: true,
        });
        const state = fieldAttributeState('postgresql', int, [int]);
        expect([state.showIncrement, state.incrementLocked]).toEqual([
            true,
            true,
        ]);
        const text = col({ type: { id: 'text', name: 'text' } });
        expect(
            fieldAttributeState('postgresql', text, [text]).showIncrement
        ).toBe(false);
        const serial = col({
            type: { id: 'serial', name: 'serial' },
            nullable: false,
        });
        const s = fieldAttributeState('postgresql', serial, [serial]);
        expect([s.showIncrement, s.incrementLocked, s.showArray]).toEqual([
            true,
            true,
            false,
        ]);
    });

    it('offers Array only where the database has arrays', () => {
        const c = col({ type: { id: 'text', name: 'text' } });
        expect(fieldAttributeState('postgresql', c, [c]).showArray).toBe(true);
        expect(fieldAttributeState('mysql', c, [c]).showArray).toBe(false);
    });

    it('offers Max only for SQL Server character types', () => {
        expect(traitsOfType('sql_server', 'varchar').allowsMax).toBe(true);
        expect(traitsOfType('postgresql', 'varchar').allowsMax).toBe(false);
        expect(traitsOfType('sql_server', 'char').allowsMax).toBe(false);
    });

    it('reads the length mode and gives ranges', () => {
        expect(lengthModeOf({})).toBe('none');
        expect(lengthModeOf({ length: 'max' })).toBe('max');
        expect(lengthModeOf({ length: 5 })).toBe('custom');
        expect(lengthLimit('sql_server', 'nvarchar')).toBe(4000);
        expect(precisionRange('mysql').maxPrecision).toBe(65);
    });
});

describe('EDT-136 reordering fields', () => {
    it('moves the dragged id to the target place', () => {
        expect(reorderedIds(['a', 'b', 'c'], 'a', 'c')).toEqual([
            'b',
            'c',
            'a',
        ]);
        expect(reorderedIds(['a', 'b', 'c'], 'c', 'a')).toEqual([
            'c',
            'a',
            'b',
        ]);
        expect(reorderedIds(['a', 'b'], 'a', 'a')).toBeUndefined();
    });
});
