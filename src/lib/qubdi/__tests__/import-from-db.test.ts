import { describe, expect, it } from 'vitest';
import postgresSample from './fixtures/postgres-sample.json';
import sqlserverSample from './fixtures/sqlserver-sample.json';
import {
    allTableKeys,
    dialectToDatabaseType,
    metadataToDiagram,
    schemasOfSelection,
    summarizeSelection,
    tableKey,
    type CatalogSchema,
} from '../import-from-db';
import { DatabaseType } from '@/lib/domain/database-type';
import type { Diagram } from '@/lib/domain/diagram';

const catalog: CatalogSchema[] = [
    { schema: 'public', tables: ['customers'], views: [] },
    {
        schema: 'shop',
        tables: ['order_items', 'orders'],
        views: ['paid_orders'],
    },
];

describe('selection helpers', () => {
    it('builds table keys and lists every selectable object', () => {
        expect(tableKey('shop', 'orders')).toBe('shop.orders');
        expect(allTableKeys(catalog)).toEqual([
            'public.customers',
            'shop.order_items',
            'shop.orders',
            'shop.paid_orders',
        ]);
    });

    it('summarizes a selection by tables, views and schemas', () => {
        const all = new Set(allTableKeys(catalog));
        expect(summarizeSelection(catalog, all)).toEqual({
            schemas: ['public', 'shop'],
            tables: 3,
            views: 1,
        });
        expect(summarizeSelection(catalog, new Set(['shop.orders']))).toEqual({
            schemas: ['shop'],
            tables: 1,
            views: 0,
        });
        expect(summarizeSelection(catalog, new Set())).toEqual({
            schemas: [],
            tables: 0,
            views: 0,
        });
        expect(summarizeSelection(catalog, new Set(['nope.table']))).toEqual({
            schemas: [],
            tables: 0,
            views: 0,
        });
    });

    it('derives the schemas to request from the selection', () => {
        expect(
            schemasOfSelection(
                new Set(['shop.orders', 'shop.order_items', 'public.customers'])
            )
        ).toEqual(['public', 'shop']);
        expect(schemasOfSelection(new Set())).toEqual([]);
    });

    it('maps dialects to QubdiDB database types', () => {
        expect(dialectToDatabaseType('postgresql')).toBe(
            DatabaseType.POSTGRESQL
        );
        expect(dialectToDatabaseType('sqlserver')).toBe(
            DatabaseType.SQL_SERVER
        );
    });
});

const fieldsOf = (d: Diagram, table: string) =>
    d.tables!.find((t) => t.name === table)!.fields;

describe.each([
    ['postgresql', postgresSample, DatabaseType.POSTGRESQL],
    ['sqlserver', sqlserverSample, DatabaseType.SQL_SERVER],
] as const)('importing a real %s catalog', (dialect, sample, type) => {
    const build = () => metadataToDiagram(dialect, sample, 'Sample');

    it('creates the diagram with the right database type and name', async () => {
        const d = await build();
        expect(d.databaseType).toBe(type);
        expect(d.name).toBe('Sample');
    });

    it('creates exactly the catalog tables', async () => {
        const d = await build();
        expect(d.tables!.map((t) => t.name).sort()).toEqual(
            expect.arrayContaining(['customers', 'order_items', 'orders'])
        );
        const real = d
            .tables!.filter((t) => !t.isView)
            .map((t) => t.name)
            .sort();
        expect(real).toEqual(['customers', 'order_items', 'orders']);
    });

    it('creates the columns of each table in catalog order', async () => {
        const d = await build();
        expect(fieldsOf(d, 'customers').map((f) => f.name)).toEqual(
            dialect === 'postgresql'
                ? ['id', 'email', 'full_name', 'balance', 'tags', 'created_at']
                : ['id', 'email', 'full_name', 'balance', 'created_at']
        );
        expect(fieldsOf(d, 'order_items').map((f) => f.name)).toEqual([
            'order_id',
            'line_no',
            'sku',
            'qty',
        ]);
    });

    it('keeps primary keys, including the composite one', async () => {
        const d = await build();
        const pk = (table: string) =>
            fieldsOf(d, table)
                .filter((f) => f.primaryKey)
                .map((f) => f.name);
        expect(pk('customers')).toEqual(['id']);
        expect(pk('orders')).toEqual(['id']);
        expect(pk('order_items').sort()).toEqual(['line_no', 'order_id']);
    });

    it('keeps nullability', async () => {
        const d = await build();
        const f = (table: string, name: string) =>
            fieldsOf(d, table).find((x) => x.name === name)!;
        expect(f('customers', 'email').nullable).toBe(false);
        expect(f('customers', 'full_name').nullable).toBe(true);
        expect(f('orders', 'note').nullable).toBe(true);
    });

    it('creates one relationship per foreign key, pointing at the right tables and fields', async () => {
        const d = await build();
        expect(d.relationships).toHaveLength(2);
        const byName = (name: string) =>
            d.relationships!.find((r) => r.name === name)!;
        const tableName = (id: string) =>
            d.tables!.find((t) => t.id === id)!.name;
        const fieldName = (tableId: string, fieldId: string) =>
            d
                .tables!.find((t) => t.id === tableId)!
                .fields.find((f) => f.id === fieldId)!.name;

        // QubdiDB's convention: the source is the referenced (one) side,
        // the target is the table that holds the foreign key (many).
        const side = (id: string, fieldId: string) => [
            tableName(id),
            fieldName(id, fieldId),
        ];
        const oc = byName('orders_customer_fk');
        expect(side(oc.sourceTableId, oc.sourceFieldId)).toEqual([
            'customers',
            'id',
        ]);
        expect(side(oc.targetTableId, oc.targetFieldId)).toEqual([
            'orders',
            'customer_id',
        ]);
        expect([oc.sourceCardinality, oc.targetCardinality]).toEqual([
            'one',
            'many',
        ]);

        const io = byName('items_order_fk');
        expect(side(io.sourceTableId, io.sourceFieldId)).toEqual([
            'orders',
            'id',
        ]);
        expect(side(io.targetTableId, io.targetFieldId)).toEqual([
            'order_items',
            'order_id',
        ]);
    });

    it('maps column types through QubdiDB (never leaves a field without a type)', async () => {
        const d = await build();
        for (const t of d.tables!) {
            for (const f of t.fields) {
                expect(f.type.id, `${t.name}.${f.name}`).toBeTruthy();
                expect(f.type.name, `${t.name}.${f.name}`).toBeTruthy();
            }
        }
        const email = fieldsOf(d, 'customers').find((f) => f.name === 'email')!;
        expect(email.characterMaximumLength).toBe('120');
    });

    it('gives every table a position so the diagram is readable immediately', async () => {
        const d = await build();
        for (const t of d.tables!) {
            expect(Number.isFinite(t.x)).toBe(true);
            expect(Number.isFinite(t.y)).toBe(true);
        }
    });
});

describe('metadataToDiagram validation', () => {
    it('rejects metadata in an unexpected format with a clear error', async () => {
        await expect(
            metadataToDiagram('postgresql', { nope: true }, 'x')
        ).rejects.toThrow(/unexpected format/);
        await expect(
            metadataToDiagram('postgresql', null, 'x')
        ).rejects.toThrow(/unexpected format/);
    });
});
