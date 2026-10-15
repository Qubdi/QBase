import { beforeEach, describe, expect, it } from 'vitest';
import postgresSample from './fixtures/postgres-sample.json';
import { metadataToDiagram } from '../import-from-db';
import {
    getLintConfig,
    hasLintConfig,
    setLintConfig,
} from '../lint-config-store';
import { planFix, resolveDataType } from '../lint-fix';
import { DatabaseType } from '@/lib/domain/database-type';
import type { Diagram } from '@/lib/domain/diagram';
import { lint, type Finding } from '../../../../shared/lint';
import { canonicalType } from '../../../../shared/schema-desc';

let diagram: Diagram;
const table = (name: string) => diagram.tables!.find((t) => t.name === name)!;
const run = () => lint(diagram as never, {});
const fixOf = (findings: Finding[], rule: string) =>
    findings.find((f) => f.ruleId === rule)!.fix!;

beforeEach(async () => {
    diagram = await metadataToDiagram('postgresql', postgresSample, 'x');
});

describe('lint on a real imported diagram', () => {
    it('finds the missing foreign key index and offers a fix that actually resolves it', () => {
        const findings = run();
        expect(findings.map((f) => f.ruleId)).toEqual([
            'foreign-key-without-index',
        ]);
        const ops = planFix(
            fixOf(findings, 'foreign-key-without-index'),
            diagram.tables!,
            DatabaseType.POSTGRESQL
        )!;
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({
            kind: 'addIndex',
            tableId: table('orders').id,
        });
        if (ops[0].kind === 'addIndex') {
            table('orders').indexes.push(ops[0].index);
        }
        expect(run()).toEqual([]);
    });

    it('does not offer the fix again once the index exists', () => {
        const fix = fixOf(run(), 'foreign-key-without-index');
        const ops = planFix(fix, diagram.tables!, DatabaseType.POSTGRESQL)!;
        if (ops[0].kind === 'addIndex')
            table('orders').indexes.push(ops[0].index);
        expect(
            planFix(fix, diagram.tables!, DatabaseType.POSTGRESQL)
        ).toBeNull();
    });
});

describe('planFix', () => {
    it('plans a type change using QubdiDB data types', () => {
        const orders = table('orders');
        const customerId = orders.fields.find((f) => f.name === 'customer_id')!;
        const ops = planFix(
            {
                action: 'set_column_type',
                tableId: orders.id,
                tableName: 'orders',
                columnId: customerId.id,
                columnName: 'customer_id',
                typeName: 'integer',
            },
            diagram.tables!,
            DatabaseType.POSTGRESQL
        )!;
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({
            kind: 'updateField',
            tableId: orders.id,
            fieldId: customerId.id,
        });
        if (ops[0].kind === 'updateField') {
            // QubdiDB spells integer "int"; what matters is that it is the same type
            expect(canonicalType(ops[0].patch.type!.name)).toBe('integer');
            expect(ops[0].patch.type!.id).toBeTruthy();
        }
    });

    it('plans a length, a removal and renames', () => {
        const customers = table('customers');
        const email = customers.fields.find((f) => f.name === 'email')!;
        const idx = table('orders').indexes[0];
        expect(
            planFix(
                {
                    action: 'set_column_length',
                    tableId: customers.id,
                    tableName: 'customers',
                    columnId: email.id,
                    columnName: 'email',
                    length: '255',
                },
                diagram.tables!,
                DatabaseType.POSTGRESQL
            )
        ).toEqual([
            {
                kind: 'updateField',
                tableId: customers.id,
                fieldId: email.id,
                patch: { characterMaximumLength: '255' },
            },
        ]);
        expect(
            planFix(
                {
                    action: 'remove_index',
                    tableId: table('orders').id,
                    tableName: 'orders',
                    indexId: idx.id,
                    indexName: idx.name,
                },
                diagram.tables!,
                DatabaseType.POSTGRESQL
            )
        ).toEqual([
            {
                kind: 'removeIndex',
                tableId: table('orders').id,
                indexId: idx.id,
            },
        ]);
        expect(
            planFix(
                {
                    action: 'rename_column',
                    tableId: customers.id,
                    tableName: 'customers',
                    columnId: email.id,
                    columnName: 'email',
                    to: 'mail',
                },
                diagram.tables!,
                DatabaseType.POSTGRESQL
            )
        ).toEqual([
            {
                kind: 'updateField',
                tableId: customers.id,
                fieldId: email.id,
                patch: { name: 'mail' },
            },
        ]);
        expect(
            planFix(
                {
                    action: 'rename_table',
                    tableId: customers.id,
                    tableName: 'customers',
                    to: 'clients',
                },
                diagram.tables!,
                DatabaseType.POSTGRESQL
            )
        ).toEqual([
            {
                kind: 'updateTable',
                tableId: customers.id,
                patch: { name: 'clients' },
            },
        ]);
    });

    it('refuses when the diagram changed since the finding', () => {
        const customers = table('customers');
        const gone = {
            action: 'remove_index' as const,
            tableId: customers.id,
            tableName: 'customers',
            indexId: 'nope',
            indexName: 'nope',
        };
        expect(
            planFix(gone, diagram.tables!, DatabaseType.POSTGRESQL)
        ).toBeNull();
        expect(
            planFix(
                { ...gone, tableId: 'missing' },
                diagram.tables!,
                DatabaseType.POSTGRESQL
            )
        ).toBeNull();
        expect(
            planFix(
                {
                    action: 'set_column_length',
                    tableId: customers.id,
                    tableName: 'customers',
                    columnId: 'gone',
                    columnName: 'x',
                    length: '1',
                },
                diagram.tables!,
                DatabaseType.POSTGRESQL
            )
        ).toBeNull();
        expect(
            planFix(
                {
                    action: 'add_index',
                    tableId: customers.id,
                    tableName: 'customers',
                    indexName: 'i',
                    columnIds: ['gone'],
                    columnNames: ['x'],
                },
                diagram.tables!,
                DatabaseType.POSTGRESQL
            )
        ).toBeNull();
    });

    it('never renames onto an existing name in the same schema', () => {
        const orders = table('orders');
        // orders and order_items both live in the shop schema
        expect(
            planFix(
                {
                    action: 'rename_table',
                    tableId: orders.id,
                    tableName: 'orders',
                    to: 'ORDER_ITEMS',
                },
                diagram.tables!,
                DatabaseType.POSTGRESQL
            )
        ).toBeNull();
        // the same name in another schema is fine
        expect(
            planFix(
                {
                    action: 'rename_table',
                    tableId: table('customers').id,
                    tableName: 'customers',
                    to: 'orders',
                },
                diagram.tables!,
                DatabaseType.POSTGRESQL
            )
        ).not.toBeNull();
        const customers = table('customers');
        const email = customers.fields.find((f) => f.name === 'email')!;
        expect(
            planFix(
                {
                    action: 'rename_column',
                    tableId: customers.id,
                    tableName: 'customers',
                    columnId: email.id,
                    columnName: 'email',
                    to: 'ID',
                },
                diagram.tables!,
                DatabaseType.POSTGRESQL
            )
        ).toBeNull();
    });
});

describe('resolveDataType', () => {
    it('finds QubdiDB types through synonyms and falls back for unknown ones', () => {
        const int = resolveDataType(DatabaseType.POSTGRESQL, 'integer');
        expect(canonicalType(int.name)).toBe('integer');
        expect(int.id).toBeTruthy();
        expect(
            canonicalType(
                resolveDataType(DatabaseType.POSTGRESQL, 'varchar').name
            )
        ).toBe('varchar');
        expect(
            resolveDataType(DatabaseType.POSTGRESQL, 'my custom type')
        ).toEqual({ id: 'my_custom_type', name: 'my custom type' });
    });
});

describe('lint config store', () => {
    beforeEach(() => localStorage.clear());

    it('stores config per diagram and cleans it', () => {
        setLintConfig('d1', {
            rules: { 'orphan-table': { enabled: false } },
            naming: { style: 'snake_case' },
        });
        setLintConfig('d2', { naming: { tables: 'singular' } });
        expect(getLintConfig('d1')).toEqual({
            rules: { 'orphan-table': { enabled: false } },
            naming: { style: 'snake_case' },
        });
        expect(getLintConfig('d2')).toEqual({ naming: { tables: 'singular' } });
        expect(getLintConfig('none')).toEqual({});
        expect(hasLintConfig('d1')).toBe(true);
        expect(hasLintConfig('none')).toBe(false);
    });

    it('survives corrupted storage and junk values', () => {
        localStorage.setItem('qubdidb.lint-config', 'not json');
        expect(getLintConfig('d1')).toEqual({});
        setLintConfig('d1', { rules: { bogus: { enabled: false } } } as never);
        expect(getLintConfig('d1')).toEqual({ rules: {} });
    });
});
