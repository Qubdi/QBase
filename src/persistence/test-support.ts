import Dexie from 'dexie';
import type { DexieOptions } from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { declareLegacyVersions } from './legacy-schema';

/** A private, empty IndexedDB for one test. */
export function freshIndexedDb(): DexieOptions {
    return { indexedDB: new IDBFactory(), IDBKeyRange };
}

type Row = Record<string, unknown>;

/**
 * Writes a database as an older editor left it: the old layout declared up to
 * `version`, filled with `rows` (store name -> rows, in the shape of that
 * version), then closed.
 */
export async function writeOldDatabase(
    options: DexieOptions,
    name: string,
    version: number,
    rows: Record<string, Row[]>
): Promise<void> {
    const old = new Dexie(name, options);
    declareLegacyVersions(old, version);
    await old.open();
    for (const [store, list] of Object.entries(rows))
        await old.table(store).bulkAdd(list);
    old.close();
}

/** The same diagram, as the oldest editor (version 1) stored it. */
export const version1Rows: Record<string, Row[]> = {
    diagrams: [
        {
            id: 'dg1',
            name: 'Library',
            databaseType: 'postgresql',
            createdAt: new Date('2025-01-02T03:04:05.000Z'),
            updatedAt: new Date('2025-01-03T03:04:05.000Z'),
        },
    ],
    db_tables: [
        {
            id: 'tb1',
            diagramId: 'dg1',
            name: 'books',
            x: 10,
            y: 20,
            color: '#8eb7ff',
            createdAt: 1000,
            isView: false,
            fields: [
                {
                    id: 'fa1',
                    name: 'id',
                    type: 'bigint',
                    primaryKey: true,
                    unique: true,
                    nullable: 'false',
                    createdAt: 1000,
                },
                {
                    id: 'fa2',
                    name: 'price',
                    type: 'double precision',
                    primaryKey: false,
                    unique: false,
                    nullable: 'TRUE',
                    createdAt: 1001,
                },
            ],
            indexes: [
                {
                    id: 'ix1',
                    name: '',
                    unique: true,
                    fieldIds: ['fa1'],
                    isPrimaryKey: true,
                    createdAt: 1000,
                },
            ],
        },
        {
            id: 'tb2',
            diagramId: 'dg1',
            name: 'loans',
            x: 400,
            y: 20,
            color: '#8eb7ff',
            createdAt: 1001,
            isView: false,
            fields: [
                {
                    id: 'fb1',
                    name: 'id',
                    type: 'bigint',
                    primaryKey: true,
                    unique: true,
                    nullable: 'false',
                    createdAt: 1001,
                },
                {
                    id: 'fb2',
                    name: 'book_id',
                    type: 'bigint',
                    primaryKey: false,
                    unique: false,
                    nullable: 'true',
                    createdAt: 1002,
                },
            ],
            indexes: [],
        },
    ],
    db_relationships: [
        {
            id: 'rl1',
            diagramId: 'dg1',
            name: 'loans_book_id_fk',
            sourceTableId: 'tb1',
            sourceFieldId: 'fa1',
            targetTableId: 'tb2',
            targetFieldId: 'fb2',
            type: 'one_to_many',
            createdAt: 1003,
        },
        {
            id: 'rl2',
            diagramId: 'dg1',
            name: 'a_many',
            sourceTableId: 'tb2',
            sourceFieldId: 'fb1',
            targetTableId: 'tb1',
            targetFieldId: 'fa2',
            type: 'many_to_many',
            createdAt: 1004,
        },
        {
            id: 'rl3',
            diagramId: 'dg1',
            name: 'no_type',
            sourceTableId: 'tb2',
            sourceFieldId: 'fb1',
            targetTableId: 'tb1',
            targetFieldId: 'fa1',
            createdAt: 1005,
        },
    ],
    config: [{ id: 1, defaultDiagramId: 'dg1' }],
};

/** A fuller diagram in the current (version 14) old layout, with every collection and some strays. */
export const version14Rows: Record<string, Row[]> = {
    diagrams: [
        {
            id: 'dg2',
            name: 'Shop',
            databaseType: 'postgresql',
            databaseEdition: 'supabase',
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            updatedAt: new Date('2026-05-02T00:00:00.000Z'),
        },
        {
            id: 'dg3',
            name: 'Other',
            databaseType: 'mysql',
            createdAt: new Date('2026-06-01T00:00:00.000Z'),
            updatedAt: new Date('2026-06-02T00:00:00.000Z'),
        },
    ],
    db_tables: [
        {
            id: 'ta',
            diagramId: 'dg2',
            name: 'customers',
            schema: 'public',
            x: 1,
            y: 2,
            color: '#8eb7ff',
            createdAt: 5,
            isView: false,
            order: 1,
            comments: 'people',
            width: 300,
            parentAreaId: 'ar1',
            mystery: { kept: true },
            fields: [
                {
                    id: 'fa',
                    name: 'id',
                    type: { id: 'bigint', name: 'bigint' },
                    primaryKey: true,
                    unique: true,
                    nullable: false,
                    createdAt: 5,
                },
                {
                    id: 'fb',
                    name: 'tags',
                    type: { id: 'text', name: 'text' },
                    isArray: true,
                    primaryKey: false,
                    unique: false,
                    nullable: true,
                    createdAt: 6,
                    characterMaximumLength: 'null',
                },
            ],
            indexes: [
                {
                    id: 'ia',
                    name: '',
                    unique: true,
                    fieldIds: ['fa'],
                    isPrimaryKey: true,
                    createdAt: 5,
                },
            ],
            checkConstraints: [
                { id: 'ck', expression: 'id > 0', createdAt: 7 },
            ],
        },
        {
            id: 'tb',
            diagramId: 'dg2',
            name: 'orders',
            schema: 'public',
            x: 500,
            y: 2,
            color: '#ff6b6b',
            createdAt: 6,
            isView: false,
            order: 0,
            fields: [
                {
                    id: 'fc',
                    name: 'id',
                    type: { id: 'bigint', name: 'bigint' },
                    primaryKey: true,
                    unique: true,
                    nullable: false,
                    createdAt: 6,
                },
                {
                    id: 'fd',
                    name: 'customer_id',
                    type: { id: 'bigint', name: 'bigint' },
                    primaryKey: false,
                    unique: false,
                    nullable: false,
                    createdAt: 7,
                },
                {
                    id: 'fe',
                    name: 'status',
                    type: { id: 'order_status', name: 'order_status' },
                    primaryKey: false,
                    unique: false,
                    nullable: false,
                    createdAt: 8,
                },
            ],
            indexes: [
                {
                    id: 'ib',
                    name: '',
                    unique: true,
                    fieldIds: ['fc'],
                    isPrimaryKey: true,
                    createdAt: 6,
                },
            ],
        },
        {
            id: 'tv',
            diagramId: 'dg2',
            name: 'v_orders',
            schema: 'public',
            x: 900,
            y: 2,
            color: '#b0b0b0',
            createdAt: 7,
            isView: true,
            isMaterializedView: true,
            order: 2,
            fields: [
                {
                    id: 'ff',
                    name: 'n',
                    type: { id: 'integer', name: 'integer' },
                    primaryKey: false,
                    unique: false,
                    nullable: true,
                    createdAt: 9,
                },
            ],
            indexes: [],
        },
        {
            id: 'tm',
            diagramId: 'dg3',
            name: 'solo',
            x: 0,
            y: 0,
            color: '#8eb7ff',
            createdAt: 1,
            isView: false,
            fields: [
                {
                    id: 'fm',
                    name: 'id',
                    type: { id: 'int', name: 'int' },
                    primaryKey: true,
                    unique: true,
                    nullable: false,
                    createdAt: 1,
                },
            ],
            indexes: [],
        },
    ],
    db_relationships: [
        {
            id: 'rb',
            diagramId: 'dg2',
            name: 'zz_last',
            sourceTableId: 'ta',
            sourceFieldId: 'fa',
            targetTableId: 'tb',
            targetFieldId: 'fd',
            sourceSchema: 'public',
            targetSchema: 'public',
            sourceCardinality: 'one',
            targetCardinality: 'many',
            createdAt: 20,
            extraKey: 1,
        },
        {
            id: 'ra',
            diagramId: 'dg2',
            name: 'aa_first',
            sourceTableId: 'ta',
            sourceFieldId: 'fa',
            targetTableId: 'tb',
            targetFieldId: 'fc',
            sourceCardinality: 'one',
            targetCardinality: 'one',
            createdAt: 21,
        },
    ],
    db_dependencies: [
        {
            id: 'dp1',
            diagramId: 'dg2',
            schema: 'public',
            tableId: 'tb',
            dependentSchema: 'public',
            dependentTableId: 'tv',
            createdAt: 30,
        },
    ],
    areas: [
        {
            id: 'ar1',
            diagramId: 'dg2',
            name: 'Sales',
            x: 0,
            y: 0,
            width: 800,
            height: 400,
            color: '#c6e377',
            order: 0,
        },
    ],
    db_custom_types: [
        {
            id: 'cz',
            diagramId: 'dg2',
            schema: 'public',
            name: 'zebra',
            kind: 'enum',
            values: ['a'],
            order: 1,
        },
        {
            id: 'ca',
            diagramId: 'dg2',
            schema: 'public',
            name: 'order_status',
            kind: 'enum',
            values: ['new', 'paid'],
            order: 0,
        },
    ],
    notes: [
        {
            id: 'nt',
            diagramId: 'dg2',
            content: 'hello',
            x: 5,
            y: 6,
            width: 200,
            height: 150,
            color: '#ffe374',
            order: 0,
        },
    ],
    config: [
        {
            id: 1,
            defaultDiagramId: 'dg3',
            exportActions: [new Date('2026-06-03T00:00:00.000Z')],
        },
    ],
    diagram_filters: [{ diagramId: 'dg2', schemaIds: ['public'] }],
};
