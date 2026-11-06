import { exportDiagramSql } from '@/qbase/sql-adapters';
import type {
    DatabaseType,
    DBField,
    DBRelationship,
    DBTable,
    Diagram,
} from '@/qbase/diagram-types';

/** SQL text of a diagram for a target database (the writer's diagnostics are dropped). */
export const exportBaseSQL = (
    options: Parameters<typeof exportDiagramSql>[0]
) => exportDiagramSql(options).text;

let counter = 0;
const next = (prefix: string) => `${prefix}-${++counter}`;

export const field = (
    name: string,
    type: string,
    over: Partial<DBField> = {}
): DBField =>
    ({
        id: next('f'),
        name,
        type: { id: type, name: type },
        primaryKey: false,
        unique: false,
        nullable: true,
        createdAt: 1,
        ...over,
    }) as DBField;

export const pk = (name: string, type: string, over: Partial<DBField> = {}) =>
    field(name, type, { primaryKey: true, nullable: false, ...over });

export const table = (
    name: string,
    fields: DBField[],
    over: Partial<DBTable> = {}
): DBTable =>
    ({
        id: next('t'),
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
        ...over,
    }) as DBTable;

/** A foreign key: `one` is the table that is pointed at, `many` holds the key. */
export const relationship = (
    name: string,
    one: [DBTable, DBField],
    many: [DBTable, DBField],
    over: Partial<DBRelationship> = {}
): DBRelationship => ({
    id: next('r'),
    name,
    sourceTableId: one[0].id,
    targetTableId: many[0].id,
    sourceFieldId: one[1].id,
    targetFieldId: many[1].id,
    sourceCardinality: 'one',
    targetCardinality: 'many',
    createdAt: 1,
    ...over,
});

export const diagram = (
    databaseType: DatabaseType,
    tables: DBTable[],
    relationships: DBRelationship[] = [],
    over: Partial<Diagram> = {}
): Diagram =>
    ({
        id: 'd',
        name: 'd',
        databaseType,
        tables,
        relationships,
        createdAt: new Date(1),
        updatedAt: new Date(1),
        ...over,
    }) as Diagram;

/** customers 1 -> * orders, with an auto numbered key and a default */
export const shop = (
    databaseType: DatabaseType,
    types = {
        int: 'int',
        str: 'varchar',
        ts: 'datetime',
    }
) => {
    const customers = table('customers', [
        pk('id', types.int, { increment: true }),
        field('email', types.str, {
            characterMaximumLength: '255',
            nullable: false,
            unique: true,
        }),
        field('created_at', types.ts, {
            nullable: false,
            default: 'CURRENT_TIMESTAMP',
        }),
    ]);
    const orders = table('orders', [
        pk('id', types.int, { increment: true }),
        field('customer_id', types.int, { nullable: false }),
    ]);
    return {
        customers,
        orders,
        diagram: diagram(
            databaseType,
            [customers, orders],
            [
                relationship(
                    'fk_orders_customer',
                    [customers, customers.fields[0]],
                    [orders, orders.fields[1]]
                ),
            ]
        ),
    };
};
