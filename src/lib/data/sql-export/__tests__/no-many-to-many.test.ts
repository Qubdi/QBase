import { describe, expect, it } from 'vitest';
import {
    DatabaseType,
    type Diagram,
    type DBField,
    type DBTable,
} from '@/qbase/diagram-types';
import { createRelationshipsFromMetadata } from '@/qbase/metadata-adapters';
import { exportBaseSQL } from './builders';

const field = (name: string, over: Partial<DBField> = {}): DBField =>
    ({
        id: `f-${name}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        type: { id: 'integer', name: 'integer' },
        primaryKey: false,
        unique: false,
        nullable: false,
        createdAt: 1,
        ...over,
    }) as DBField;

const table = (name: string, fields: DBField[]): DBTable =>
    ({
        id: `t-${name}`,
        name,
        schema: '',
        fields,
        indexes: [],
        x: 0,
        y: 0,
        color: '#3b82f6',
        isView: false,
        createdAt: 1,
        order: 0,
    }) as DBTable;

const customers = () => table('customers', [field('id', { primaryKey: true })]);
const orders = () =>
    table('orders', [field('id', { primaryKey: true }), field('customer_id')]);

/** A diagram holding a many-to-many, as one saved before they were dropped can. */
const legacyDiagram = (databaseType: DatabaseType): Diagram => {
    const c = customers();
    const o = orders();
    return {
        id: 'd',
        name: 'shop',
        databaseType,
        tables: [c, o],
        relationships: [
            {
                id: 'r1',
                name: 'fk_orders_customer',
                sourceTableId: c.id,
                targetTableId: o.id,
                sourceFieldId: c.fields[0].id,
                targetFieldId: o.fields[1].id,
                sourceCardinality: 'many',
                targetCardinality: 'many',
                createdAt: 1,
            },
        ],
        createdAt: new Date(1),
        updatedAt: new Date(1),
    } as Diagram;
};

const foreignKeys = (sql: string) => sql.match(/FOREIGN KEY/g) ?? [];

describe('exporting a diagram that still holds a many-to-many', () => {
    it.each([
        [DatabaseType.POSTGRESQL, DatabaseType.POSTGRESQL],
        [DatabaseType.MYSQL, DatabaseType.MYSQL],
        [DatabaseType.MARIADB, DatabaseType.MARIADB],
        [DatabaseType.SQL_SERVER, DatabaseType.SQL_SERVER],
        [DatabaseType.SQLITE, DatabaseType.SQLITE],
        [DatabaseType.POSTGRESQL, DatabaseType.MYSQL],
        [DatabaseType.POSTGRESQL, DatabaseType.SQL_SERVER],
    ])('%s to %s keeps the foreign key instead of dropping it', (from, to) => {
        const sql = exportBaseSQL({
            diagram: legacyDiagram(from),
            targetDatabaseType: to,
        });

        expect(foreignKeys(sql)).toHaveLength(1);
        // the key lives on the table that holds it (orders) and points at customers
        expect(sql).toMatch(/REFERENCES[^\n]*customers/);
    });
});

describe('exporting a database imported with a composite-key foreign key', () => {
    it('exports them as the one composite foreign key they were', () => {
        const lines = table('order_lines', [
            field('order_id', { primaryKey: true }),
            field('line_no', { primaryKey: true }),
        ]);
        const notes = table('line_notes', [
            field('id', { primaryKey: true }),
            field('order_id'),
            field('line_no'),
        ]);
        const tables = [lines, notes].map((t) => ({ ...t, schema: 'public' }));
        const relationships = createRelationshipsFromMetadata({
            tables,
            foreignKeys: [
                ['order_id', 'fk_a'],
                ['line_no', 'fk_b'],
            ].map(([column, name]) => ({
                schema: 'public',
                table: 'line_notes',
                column,
                foreign_key_name: name,
                reference_schema: 'public',
                reference_table: 'order_lines',
                reference_column: column,
                fk_def: '',
            })),
        });

        const sql = exportBaseSQL({
            diagram: {
                id: 'd',
                name: 'd',
                databaseType: DatabaseType.POSTGRESQL,
                tables,
                relationships,
                createdAt: new Date(1),
                updatedAt: new Date(1),
            } as Diagram,
            targetDatabaseType: DatabaseType.POSTGRESQL,
        });

        // one constraint over both columns: a database refuses one on half a key
        expect(foreignKeys(sql)).toHaveLength(1);
        expect(sql).toMatch(/FOREIGN KEY\("order_id", "line_no"\)/);
    });
});
