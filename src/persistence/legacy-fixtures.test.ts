/**
 * Phase 9 data checks: an old-layout (nine-store) browser database built by
 * hand from the data format spec (the old layout), opened through the
 * migration. Every field name and shape here comes from the spec, not from
 * the code under test.
 */
import { describe, expect, it, vi } from 'vitest';
import { listOf } from '../core/model/collection';
import { parse } from '../core/wire/parse';
import { serialise } from '../core/wire/serialise';
import { QBaseDatabase } from './database';
import { openDexieStorage } from './dexie-adapter';
import { migrateLegacyLayout, MIGRATION_MARKER } from './migrate-legacy';
import { freshIndexedDb, writeOldDatabase } from './test-support';

const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);
type Row = Record<string, unknown>;

const T0 = 1760693400000;
const field = (
    id: string,
    name: string,
    type: string,
    extra: Row = {}
): Row => ({
    id,
    name,
    type: { id: type.replace(/ /g, '_'), name: type },
    primaryKey: false,
    unique: false,
    nullable: true,
    createdAt: T0,
    ...extra,
});
const pkIndex = (id: string, ...fieldIds: string[]): Row => ({
    id,
    name: '',
    unique: true,
    fieldIds,
    isPrimaryKey: true,
    createdAt: T0,
});

/** A "Webshop" diagram as the old editor left it (version 14 shapes). */
function webshop(): Record<string, Row[]> {
    return {
        diagrams: [
            {
                id: 'k3f9a1b2zx0q',
                name: 'Webshop',
                databaseType: 'postgresql',
                databaseEdition: 'timescale',
                createdAt: new Date('2026-10-17T09:30:00.000Z'),
                updatedAt: new Date('2026-10-17T09:31:12.000Z'),
            },
            {
                id: 'k3f9a1b2zx0r',
                name: 'Warehouse',
                databaseType: 'sql_server',
                databaseEdition: 'sql_server_2016_and_below',
                createdAt: new Date('2026-03-01T08:00:00.000Z'),
                updatedAt: new Date('2026-03-02T08:00:00.000Z'),
            },
        ],
        db_tables: [
            {
                id: 't1',
                diagramId: 'k3f9a1b2zx0q',
                name: 'customers',
                schema: 'shop',
                x: 120,
                y: 80,
                color: '#8eb7ff',
                isView: false,
                createdAt: T0,
                width: 337,
                comments: 'Everyone who bought something',
                order: 0,
                expanded: true,
                parentAreaId: 'a1',
                fields: [
                    field('f1', 'id', 'bigint', {
                        primaryKey: true,
                        unique: true,
                        nullable: false,
                        increment: true,
                    }),
                    field('f2', 'email', 'varchar', {
                        unique: true,
                        nullable: false,
                        characterMaximumLength: '255',
                        collation: 'C',
                        comments: 'login',
                    }),
                    field('f3', 'balance', 'numeric', {
                        precision: 12,
                        scale: 2,
                        default: '0',
                        nullable: false,
                        check: 'balance >= 0',
                    }),
                    field('f4', 'labels', 'text', { isArray: true }),
                ],
                indexes: [
                    pkIndex('i1', 'f1'),
                    {
                        id: 'i2',
                        name: 'customers_email_hash',
                        unique: false,
                        fieldIds: ['f2'],
                        type: 'hash',
                        createdAt: T0 + 5,
                        comments: 'lookups',
                    },
                ],
                checkConstraints: [
                    {
                        id: 'c1',
                        expression: 'length(email) > 3',
                        createdAt: T0,
                    },
                ],
            },
            {
                id: 't2',
                diagramId: 'k3f9a1b2zx0q',
                name: 'orders',
                schema: 'shop',
                x: 520.5,
                y: -40,
                color: '#ff9f74',
                isView: false,
                createdAt: T0 + 1,
                order: 1,
                fields: [
                    field('f5', 'id', 'bigint', {
                        primaryKey: true,
                        unique: true,
                        nullable: false,
                        increment: true,
                    }),
                    field('f6', 'customer_id', 'bigint', { nullable: false }),
                    field('f7', 'state', 'order_state', { nullable: false }),
                    field('f8', 'placed_at', 'timestamp with time zone', {
                        default: 'now()',
                    }),
                ],
                indexes: [pkIndex('i3', 'f5')],
            },
            {
                id: 't3',
                diagramId: 'k3f9a1b2zx0q',
                name: 'v_open_orders',
                schema: 'shop',
                x: 900,
                y: 300,
                color: '#b0b0b0',
                isView: true,
                isMaterializedView: false,
                createdAt: T0 + 2,
                order: 2,
                fields: [field('f9', 'id', 'bigint')],
                indexes: [],
            },
            {
                id: 't4',
                diagramId: 'k3f9a1b2zx0r',
                name: 'Stock',
                schema: 'dbo',
                x: 0,
                y: 0,
                color: '#8eb7ff',
                isView: false,
                createdAt: T0 + 3,
                fields: [
                    field('g1', 'Id', 'int', {
                        primaryKey: true,
                        unique: true,
                        nullable: false,
                        increment: true,
                    }),
                    field('g2', 'Note', 'nvarchar', {
                        characterMaximumLength: 'max',
                    }),
                ],
                indexes: [pkIndex('j1', 'g1')],
            },
        ],
        db_relationships: [
            {
                id: 'r1',
                diagramId: 'k3f9a1b2zx0q',
                name: 'orders_customer_id_fk',
                sourceSchema: 'shop',
                sourceTableId: 't1',
                sourceFieldId: 'f1',
                targetSchema: 'shop',
                targetTableId: 't2',
                targetFieldId: 'f6',
                sourceCardinality: 'one',
                targetCardinality: 'many',
                createdAt: T0 + 10,
            },
        ],
        db_dependencies: [
            {
                id: 'd1',
                diagramId: 'k3f9a1b2zx0q',
                schema: 'shop',
                tableId: 't2',
                dependentSchema: 'shop',
                dependentTableId: 't3',
                createdAt: T0 + 11,
            },
        ],
        areas: [
            {
                id: 'a1',
                diagramId: 'k3f9a1b2zx0q',
                name: 'Sales',
                x: 60,
                y: 20,
                width: 700,
                height: 420,
                color: '#c6e377',
                order: 0,
            },
        ],
        db_custom_types: [
            {
                id: 'u1',
                diagramId: 'k3f9a1b2zx0q',
                schema: 'shop',
                name: 'order_state',
                kind: 'enum',
                values: ['new', 'paid', "it's gone"],
                order: 0,
            },
            {
                id: 'u2',
                diagramId: 'k3f9a1b2zx0q',
                schema: 'shop',
                name: 'address',
                kind: 'composite',
                fields: [
                    { field: 'street', type: 'text' },
                    { field: 'zip', type: 'varchar(10)' },
                ],
                order: 1,
            },
        ],
        notes: [
            {
                id: 'n1',
                diagramId: 'k3f9a1b2zx0q',
                content: 'Check with finance\nbefore release',
                x: 40,
                y: 500,
                width: 240,
                height: 120,
                color: '#ffe374',
                order: 0,
            },
        ],
        config: [
            {
                id: 1,
                defaultDiagramId: 'k3f9a1b2zx0r',
                exportActions: [new Date('2026-10-01T00:00:00.000Z')],
            },
        ],
        diagram_filters: [
            {
                diagramId: 'k3f9a1b2zx0q',
                schemaIds: ['shop'],
                tableIds: ['t4'],
            },
        ],
    };
}

const withoutDiagramId = (row: Row): Row => {
    const rest = { ...row };
    delete rest.diagramId;
    return rest;
};

describe('PH9 a realistic old-layout database arrives intact', () => {
    it('keeps positions, colours, field flags, links, areas, notes, custom types, schemas, type, timestamps', async () => {
        const options = freshIndexedDb();
        const rows = webshop();
        await writeOldDatabase(options, 'QBase', 14, rows);
        const { adapter, migration } = await openDexieStorage({
            ...options,
            now: NOW,
        });
        expect(migration.migrated.sort()).toEqual([
            'k3f9a1b2zx0q',
            'k3f9a1b2zx0r',
        ]);
        expect(migration.warnings).toEqual({});

        const shop = (await adapter.load('k3f9a1b2zx0q'))!;
        expect(shop.warnings).toEqual([]);
        const out = serialise(shop.design);
        expect(out).toMatchObject({
            id: 'k3f9a1b2zx0q',
            name: 'Webshop',
            databaseType: 'postgresql',
            databaseEdition: 'timescale',
            createdAt: '2026-10-17T09:30:00.000Z',
            updatedAt: '2026-10-17T09:31:12.000Z',
        });

        // every old table row (minus the stray diagramId) is inside the written one
        const tables = out.tables as Row[];
        for (const old of rows.db_tables.filter(
            (t) => t.diagramId === 'k3f9a1b2zx0q'
        )) {
            const written = tables.find((t) => t.id === old.id)!;
            expect(written, `table ${String(old.id)}`).toBeDefined();
            const expected = withoutDiagramId(old);
            // `false` for the optional isMaterializedView is the same as unset
            if (expected.isMaterializedView === false)
                delete expected.isMaterializedView;
            expect(written).toMatchObject({
                ...expected,
                fields: (expected.fields as Row[]).map((f) =>
                    expect.objectContaining(f)
                ),
                indexes: (expected.indexes as Row[]).map((i) =>
                    expect.objectContaining(i)
                ),
            });
        }
        // positions, with decimals and negatives
        expect(tables.find((t) => t.id === 't2')).toMatchObject({
            x: 520.5,
            y: -40,
            color: '#ff9f74',
        });
        // field flags
        const customers = tables.find((t) => t.id === 't1')!;
        const flags = (customers.fields as Row[]).find((f) => f.id === 'f1')!;
        expect(flags).toMatchObject({
            primaryKey: true,
            unique: true,
            nullable: false,
            increment: true,
        });
        expect((customers.fields as Row[]).map((f) => f.id)).toEqual([
            'f1',
            'f2',
            'f3',
            'f4',
        ]);

        expect(out.relationships).toEqual([
            expect.objectContaining(withoutDiagramId(rows.db_relationships[0])),
        ]);
        expect(out.dependencies).toEqual([
            expect.objectContaining(withoutDiagramId(rows.db_dependencies[0])),
        ]);
        expect(out.areas).toEqual([
            expect.objectContaining(withoutDiagramId(rows.areas[0])),
        ]);
        expect(out.notes).toEqual([
            expect.objectContaining(withoutDiagramId(rows.notes[0])),
        ]);
        expect(out.customTypes).toEqual([
            // the explicit `order` numbers decide (data-format 2.5), not the name
            expect.objectContaining({
                id: 'u1',
                name: 'order_state',
                schema: 'shop',
                values: ['new', 'paid', "it's gone"],
                order: 0,
            }),
            expect.objectContaining({
                id: 'u2',
                name: 'address',
                kind: 'composite',
                fields: [
                    { field: 'street', type: 'text' },
                    { field: 'zip', type: 'varchar(10)' },
                ],
                order: 1,
            }),
        ]);
        expect(JSON.stringify(out)).not.toContain('diagramId');

        // the second diagram: other database type and edition, own schema
        const stock = (await adapter.load('k3f9a1b2zx0r'))!.design;
        expect(stock.databaseType).toBe('sql_server');
        expect(stock.databaseEdition).toBe('sql_server_2016_and_below');
        expect(listOf(stock.entities).map((e) => e.schema)).toEqual(['dbo']);
        const collation = serialise(stock).tables as Row[];
        expect(
            (collation[0].fields as Row[]).find((f) => f.id === 'g2')
        ).toMatchObject({ characterMaximumLength: 'max' });

        // the list index, filter and settings
        const list = await adapter.list();
        const entry = list.find((d) => d.id === 'k3f9a1b2zx0q')!;
        expect(entry).toMatchObject({
            name: 'Webshop',
            tableCount: 3,
            linkCount: 1,
            createdAt: Date.parse('2026-10-17T09:30:00.000Z'),
            updatedAt: Date.parse('2026-10-17T09:31:12.000Z'),
        });
        expect(await adapter.readFilter('k3f9a1b2zx0q')).toEqual({
            schemaIds: ['shop'],
            tableIds: ['t4'],
        });
        expect(await adapter.readSettings()).toMatchObject({
            defaultDiagramId: 'k3f9a1b2zx0r',
        });
    });

    it('round trips: what loads serialises and parses back to the same wire document', async () => {
        const options = freshIndexedDb();
        await writeOldDatabase(options, 'QBase', 14, webshop());
        const { adapter } = await openDexieStorage({ ...options, now: NOW });
        const loaded = (await adapter.load('k3f9a1b2zx0q'))!;
        const wire = serialise(loaded.design);
        const again = parse(JSON.parse(JSON.stringify(wire)), { now: NOW });
        expect(again.warnings).toEqual([]);
        expect(serialise(again.design)).toEqual(wire);
    });
});

describe('PH9 the old stores are not destroyed', () => {
    async function snapshot(db: QBaseDatabase) {
        const out: Record<string, unknown[]> = {};
        for (const name of [
            'diagrams',
            'db_tables',
            'db_relationships',
            'db_dependencies',
            'areas',
            'db_custom_types',
            'notes',
            'config',
            'diagram_filters',
        ])
            out[name] = await db.table(name).toArray();
        return out;
    }

    it('leaves every old row exactly as it was, after the new record is written', async () => {
        const options = freshIndexedDb();
        await writeOldDatabase(options, 'QBase', 14, webshop());
        const probe = new QBaseDatabase('QBase', options);
        await probe.open();
        const before = await snapshot(probe);
        probe.close();
        const { adapter } = await openDexieStorage({ ...options, now: NOW });
        expect(await snapshot(adapter.db)).toEqual(before);
        expect(await adapter.db.designs.count()).toBe(2);
    });

    it('a failure while writing rolls everything back: no marker, no new record, old rows intact, next open retries', async () => {
        const options = freshIndexedDb();
        await writeOldDatabase(options, 'QBase', 14, webshop());
        const db = new QBaseDatabase('QBase', options);
        await db.open();
        const before = await snapshot(db);
        const put = db.design_index.put.bind(db.design_index);
        let calls = 0;
        vi.spyOn(db.design_index, 'put').mockImplementation(((
            ...args: Parameters<typeof put>
        ) => {
            calls += 1;
            if (calls === 2) return Promise.reject(new Error('disk full'));
            return put(...args);
        }) as typeof put);
        await expect(migrateLegacyLayout(db, NOW)).rejects.toThrow();
        expect(await db.meta.get(MIGRATION_MARKER)).toBeUndefined();
        expect(await db.designs.count()).toBe(0);
        expect(await db.design_index.count()).toBe(0);
        expect(await snapshot(db)).toEqual(before);
        vi.restoreAllMocks();
        const retry = await migrateLegacyLayout(db, NOW);
        expect(retry.migrated).toHaveLength(2);
        expect(await db.designs.count()).toBe(2);
        db.close();
    });

    it('a second open is a no-op: same records, no report, marker unchanged', async () => {
        const options = freshIndexedDb();
        await writeOldDatabase(options, 'QBase', 14, webshop());
        const first = await openDexieStorage({ ...options, now: NOW });
        const marker = await first.adapter.db.meta.get(MIGRATION_MARKER);
        const docs = await first.adapter.db.designs.toArray();
        const index = await first.adapter.db.design_index.toArray();
        const config = await first.adapter.db.config.toArray();
        first.adapter.db.close();
        const second = await openDexieStorage({
            ...options,
            now: NOW + 99999,
        });
        expect(second.migration).toEqual({
            ran: false,
            migrated: [],
            skipped: [],
            warnings: {},
        });
        expect(await second.adapter.db.meta.get(MIGRATION_MARKER)).toEqual(
            marker
        );
        expect(await second.adapter.db.designs.toArray()).toEqual(docs);
        expect(await second.adapter.db.design_index.toArray()).toEqual(index);
        expect(await second.adapter.db.config.toArray()).toEqual(config);
    });
});

describe('PH9 damaged old rows are repaired or skipped with a diagnostic', () => {
    function damaged(): Record<string, Row[]> {
        const id = 'bad1';
        return {
            diagrams: [
                // no name, unknown database type, unreadable dates
                {
                    id,
                    databaseType: 'db2',
                    createdAt: 'yesterday-ish',
                    updatedAt: null,
                },
            ],
            db_tables: [
                {
                    id: 'x1',
                    diagramId: id,
                    name: 'people',
                    x: 'left',
                    y: null,
                    color: 12,
                    isView: 'no',
                    createdAt: 'long ago',
                    parentAreaId: 'missing-area',
                    fields: [
                        field('p1', 'id', 'bigint', { primaryKey: true }),
                        // wrong types everywhere
                        {
                            id: 'p2',
                            name: 'age',
                            type: 7,
                            primaryKey: 'yes',
                            nullable: 'maybe',
                            characterMaximumLength: 255,
                            precision: 'wide',
                        },
                        'not a field',
                        {
                            name: 'no id here',
                            type: { id: 'int', name: 'int' },
                        },
                        null,
                    ],
                    indexes: [
                        {
                            id: 'q1',
                            name: 'by_age',
                            unique: false,
                            fieldIds: ['p2', 'ghost', 5],
                            createdAt: T0,
                        },
                        'junk',
                    ],
                    checkConstraints: [{ id: 'k1' }, 3],
                },
                // fields is not a list at all
                {
                    id: 'x2',
                    diagramId: id,
                    name: 'pets',
                    x: 10,
                    y: 10,
                    color: '#8eb7ff',
                    isView: false,
                    createdAt: T0,
                    fields: 'oops',
                    indexes: { not: 'a list' },
                },
                // a table with no id and no name
                { diagramId: id, x: 1, y: 1 },
            ],
            db_relationships: [
                // ok
                {
                    id: 'y1',
                    diagramId: id,
                    name: 'fine',
                    sourceTableId: 'x1',
                    sourceFieldId: 'p1',
                    targetTableId: 'x1',
                    targetFieldId: 'p2',
                    sourceCardinality: 'one',
                    targetCardinality: 'many',
                    createdAt: T0,
                },
                // dangling table
                {
                    id: 'y2',
                    diagramId: id,
                    name: 'dangling_table',
                    sourceTableId: 'gone',
                    sourceFieldId: 'p1',
                    targetTableId: 'x1',
                    targetFieldId: 'p2',
                    sourceCardinality: 'one',
                    targetCardinality: 'many',
                    createdAt: T0,
                },
                // dangling field
                {
                    id: 'y3',
                    diagramId: id,
                    name: 'dangling_field',
                    sourceTableId: 'x1',
                    sourceFieldId: 'nope',
                    targetTableId: 'x1',
                    targetFieldId: 'p2',
                    createdAt: T0,
                },
                // missing everything but an id, and a nonsense cardinality
                { id: 'y4', diagramId: id },
                {
                    id: 'y5',
                    diagramId: id,
                    name: 'weird_cardinality',
                    sourceTableId: 'x1',
                    sourceFieldId: 'p1',
                    targetTableId: 'x1',
                    targetFieldId: 'p2',
                    sourceCardinality: 'lots',
                    targetCardinality: 'many',
                    createdAt: T0,
                },
            ],
            db_dependencies: [
                { id: 'z1', diagramId: id, tableId: 'x1' },
                {
                    id: 'z2',
                    diagramId: id,
                    tableId: 'gone',
                    dependentTableId: 'x1',
                },
                {
                    id: 'z3',
                    diagramId: id,
                    tableId: 'x1',
                    dependentTableId: 'x2',
                    createdAt: T0,
                },
            ],
            areas: [{ id: 'ar', diagramId: id, name: 5, x: 'a', width: -1 }],
            db_custom_types: [
                { id: 'ct1', diagramId: id, name: 'mystery', kind: 'range' },
                {
                    id: 'ct2',
                    diagramId: id,
                    name: 'mood',
                    kind: 'enum',
                    values: ['ok', 9, null],
                },
                { id: 'ct3', diagramId: id, kind: 'enum' },
            ],
            notes: [{ id: 'nn', diagramId: id, content: 42, x: 'x', color: 1 }],
        };
    }

    it('opens without throwing and keeps what can be kept', async () => {
        const options = freshIndexedDb();
        const rows = damaged();
        // a healthy diagram next to the broken one must not be affected
        const healthy = webshop();
        await writeOldDatabase(options, 'QBase', 14, {
            ...rows,
            diagrams: [...rows.diagrams, ...healthy.diagrams.slice(0, 1)],
            db_tables: [...rows.db_tables, ...healthy.db_tables.slice(0, 3)],
            db_relationships: [
                ...rows.db_relationships,
                ...healthy.db_relationships,
            ],
            db_dependencies: [
                ...rows.db_dependencies,
                ...healthy.db_dependencies,
            ],
            areas: [...rows.areas, ...healthy.areas],
            db_custom_types: [
                ...rows.db_custom_types,
                ...healthy.db_custom_types,
            ],
            notes: [...rows.notes, ...healthy.notes],
        });
        const { adapter, migration } = await openDexieStorage({
            ...options,
            now: NOW,
        });
        expect(migration.migrated.sort()).toEqual(['bad1', 'k3f9a1b2zx0q']);
        // diagnostics exist for the broken diagram, none for the healthy one
        expect(migration.warnings.bad1.length).toBeGreaterThan(8);
        expect(migration.warnings.k3f9a1b2zx0q).toBeUndefined();
        for (const w of migration.warnings.bad1) {
            expect(typeof w.path).toBe('string');
            expect(w.message.length).toBeGreaterThan(0);
        }

        const design = (await adapter.load('bad1'))!.design;
        // the diagram itself: unknown type falls back, dates become "now"
        expect(design.databaseType).toBe('postgresql');
        expect(design.createdAt).toBe(NOW);
        expect(design.updatedAt).toBe(NOW);
        expect(design.name.length).toBeGreaterThan(0);

        const people = listOf(design.entities).find(
            (e) => e.name === 'people'
        )!;
        expect(people).toBeDefined();
        const cols = people.columnIds.map((c) => design.columns[c]);
        // the good field and the half-good ones stay, the non-objects go
        expect(cols.map((c) => c.name)).toEqual(
            expect.arrayContaining(['id', 'age'])
        );
        expect(cols.every((c) => typeof c.name === 'string')).toBe(true);
        expect(people.regionId).toBeUndefined();
        // the table with a list of fields that is not a list is kept, empty
        expect(
            listOf(design.entities).find((e) => e.name === 'pets')!.columnIds
        ).toEqual([]);

        // links: the good one stays; none points at something that is not there
        const links = listOf(design.links);
        expect(links.map((l) => l.name)).toContain('fine');
        expect(links.map((l) => l.name)).not.toContain('dangling_table');
        expect(links.map((l) => l.name)).not.toContain('dangling_field');
        for (const l of links) {
            expect(design.entities.byId[l.sourceEntityId]).toBeDefined();
            expect(design.entities.byId[l.targetEntityId]).toBeDefined();
            expect(design.columns[l.sourceColumnId]).toBeDefined();
            expect(design.columns[l.targetColumnId]).toBeDefined();
            expect(
                l.sourceCardinality === 'many' && l.targetCardinality === 'many'
            ).toBe(false);
        }
        // every index lists only columns its own table has
        for (const e of listOf(design.entities))
            for (const kid of e.keyIds)
                for (const c of design.keys[kid].members)
                    expect(e.columnIds).toContain(c);

        // the healthy diagram's own table survived the same run untouched
        const shop = (await adapter.load('k3f9a1b2zx0q'))!;
        expect(shop.warnings).toEqual([]);
        expect(listOf(shop.design.entities)).toHaveLength(3);
    });

    it('the migrated damaged design is stable: saving and loading it again gives no new warnings', async () => {
        const options = freshIndexedDb();
        await writeOldDatabase(options, 'QBase', 14, damaged());
        const { adapter } = await openDexieStorage({ ...options, now: NOW });
        const first = (await adapter.load('bad1'))!;
        const wire = serialise(first.design);
        const again = parse(JSON.parse(JSON.stringify(wire)), { now: NOW });
        expect(again.warnings).toEqual([]);
        expect(serialise(again.design)).toEqual(wire);
    });

    it('rows of a diagram that does not exist are never read, and rows with no diagramId are ignored', async () => {
        const options = freshIndexedDb();
        const rows = webshop();
        await writeOldDatabase(options, 'QBase', 14, {
            ...rows,
            db_tables: [
                ...rows.db_tables,
                {
                    id: 'orphan',
                    diagramId: 'no-such-diagram',
                    name: 'orphan',
                    x: 0,
                    y: 0,
                    fields: [],
                    indexes: [],
                },
                { id: 'loose', name: 'loose', x: 0, y: 0 },
            ],
        });
        const { adapter, migration } = await openDexieStorage({
            ...options,
            now: NOW,
        });
        expect(migration.migrated).toHaveLength(2);
        const names = listOf(
            (await adapter.load('k3f9a1b2zx0q'))!.design.entities
        ).map((e) => e.name);
        expect(names).not.toContain('orphan');
        expect(names).not.toContain('loose');
        expect(await adapter.db.db_tables.count()).toBe(
            rows.db_tables.length + 2
        );
    });

    it('a diagram row that is not an object-like record (no id at all) does not stop the others', async () => {
        const options = freshIndexedDb();
        const rows = webshop();
        await writeOldDatabase(options, 'QBase', 14, {
            ...rows,
            diagrams: [
                ...rows.diagrams,
                // key path `id` is required by the store, so the oddest legal row is an empty-named one
                { id: 'empty', name: '', databaseType: '' },
            ],
        });
        const { adapter, migration } = await openDexieStorage({
            ...options,
            now: NOW,
        });
        expect(migration.migrated).toContain('empty');
        expect((await adapter.load('empty'))!.design.entities.order).toEqual(
            []
        );
        expect((await adapter.list()).length).toBe(3);
    });
});

describe('PH9 a database older than version 14 upgrades through the same path', () => {
    it('v6 shapes (cardinality missing, text types, text nullable) arrive as v14 shapes', async () => {
        const options = freshIndexedDb();
        await writeOldDatabase(options, 'QBase', 5, {
            diagrams: [
                {
                    id: 'old',
                    name: 'Ancient',
                    databaseType: 'mysql',
                    createdAt: new Date('2024-01-01T00:00:00.000Z'),
                    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
                },
            ],
            db_tables: [
                {
                    id: 'ot1',
                    diagramId: 'old',
                    name: 'a',
                    x: 1,
                    y: 2,
                    color: '#8eb7ff',
                    isView: false,
                    createdAt: 1,
                    fields: [
                        {
                            id: 'of1',
                            name: 'id',
                            type: 'double precision',
                            primaryKey: true,
                            unique: true,
                            nullable: 'FALSE',
                            createdAt: 1,
                        },
                    ],
                    indexes: [],
                },
                {
                    id: 'ot2',
                    diagramId: 'old',
                    name: 'b',
                    x: 3,
                    y: 4,
                    color: '#8eb7ff',
                    isView: false,
                    createdAt: 2,
                    fields: [
                        {
                            id: 'of2',
                            name: 'a_id',
                            type: 'int',
                            primaryKey: false,
                            unique: false,
                            nullable: 'true',
                            createdAt: 2,
                        },
                    ],
                    indexes: [],
                },
            ],
            db_relationships: [
                {
                    id: 'or1',
                    diagramId: 'old',
                    name: 'b_a_id_fk',
                    sourceTableId: 'ot1',
                    sourceFieldId: 'of1',
                    targetTableId: 'ot2',
                    targetFieldId: 'of2',
                    type: 'many_to_one',
                    createdAt: 3,
                },
            ],
        });
        const { adapter } = await openDexieStorage({ ...options, now: NOW });
        const out = serialise((await adapter.load('old'))!.design);
        const tables = out.tables as Row[];
        expect((tables[0].fields as Row[])[0]).toMatchObject({
            type: { id: 'double_precision', name: 'double precision' },
            nullable: false,
        });
        expect((tables[1].fields as Row[])[0]).toMatchObject({
            nullable: true,
        });
        expect(out.relationships).toEqual([
            expect.objectContaining({
                sourceCardinality: 'many',
                targetCardinality: 'one',
            }),
        ]);
        expect(JSON.stringify(out)).not.toContain('"type":"many_to_one"');
    });
});

describe('PH9 a very old row whose diagram id is a number (auto-increment)', () => {
    it('still finds its child rows and keeps the design, with a diagnostic for the ids it had to make', async () => {
        const options = freshIndexedDb();
        await writeOldDatabase(options, 'QBase', 14, {
            diagrams: [
                {
                    id: 7,
                    name: 'Numbered',
                    databaseType: 'mysql',
                    createdAt: new Date('2025-01-01T00:00:00.000Z'),
                    updatedAt: new Date('2025-01-02T00:00:00.000Z'),
                },
            ],
            db_tables: [
                {
                    id: 'nt1',
                    diagramId: 7,
                    name: 'kept',
                    x: 5,
                    y: 6,
                    color: '#8eb7ff',
                    isView: false,
                    createdAt: 1,
                    fields: [],
                    indexes: [],
                },
            ],
        });
        const { adapter, migration } = await openDexieStorage({
            ...options,
            now: NOW,
        });
        expect(migration.migrated).toEqual(['7']);
        const design = (await adapter.load('7'))!.design;
        expect(design.name).toBe('Numbered');
        expect(listOf(design.entities).map((e) => e.name)).toEqual(['kept']);
    });
});
