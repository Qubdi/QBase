import { IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { listOf } from '../core/model/collection';
import { NOW, withTables } from '../core/testing/helpers';
import { parse } from '../core/wire/parse';
import { serialise } from '../core/wire/serialise';
import { shop } from '../core/wire/fixtures/shop';
import {
    DATABASE_NAME,
    PREVIOUS_DATABASE_NAME,
    QBaseDatabase,
    databaseExists,
} from './database';
import { openDexieStorage } from './dexie-adapter';
import { MemoryStorageAdapter } from './memory-adapter';
import { mergePreviousDatabase } from './merge-previous';
import { MIGRATION_MARKER } from './migrate-legacy';
import { openStorage } from './open-storage';
import type { StorageAdapter } from './storage-adapter';
import {
    freshIndexedDb,
    version14Rows,
    version1Rows,
    writeOldDatabase,
} from './test-support';

const now = NOW;

describe('DAT-001 diagrams live in the browser database QBase and survive reloads', () => {
    it('keeps the name QBase and a browser version of 140 or higher', async () => {
        const options = freshIndexedDb();
        const { adapter } = await openDexieStorage({ ...options, now });
        expect(adapter.db.name).toBe(DATABASE_NAME);
        expect(adapter.db.verno).toBeGreaterThanOrEqual(14);
        expect(adapter.db.backendDB().version).toBeGreaterThanOrEqual(140);
        expect(await databaseExists('QBase', options)).toBe(true);
    });

    it('a saved design is there after the database is closed and opened again', async () => {
        const options = freshIndexedDb();
        const first = await openDexieStorage({ ...options, now });
        const design = parse(shop, { now }).design;
        await first.adapter.save(design);
        first.adapter.db.close();
        const second = await openDexieStorage({ ...options, now });
        const loaded = await second.adapter.load(design.id);
        expect(loaded?.design).toEqual(design);
        expect(serialise(loaded!.design)).toEqual(shop);
    });
});

describe('DAT-014 one record per diagram and a small list index', () => {
    it('writes only the new stores; the old stores are left as they were', async () => {
        const options = freshIndexedDb();
        await writeOldDatabase(options, 'QBase', 14, version14Rows);
        const { adapter } = await openDexieStorage({ ...options, now });
        const before = await adapter.db.db_tables.toArray();
        const design = parse(shop, { now }).design;
        await adapter.save(design);
        await adapter.save({ ...design, name: 'Renamed' });
        expect(await adapter.db.db_tables.toArray()).toEqual(before);
        expect(await adapter.db.designs.count()).toBe(3);
        expect(await adapter.db.design_index.count()).toBe(3);
        const index = await adapter.db.design_index.get(design.id);
        expect(index).toMatchObject({
            name: 'Renamed',
            tableCount: 3,
            linkCount: 1,
            databaseType: 'postgresql',
            databaseEdition: 'supabase',
        });
        expect((await adapter.db.designs.get(design.id))!.doc.name).toBe(
            'Renamed'
        );
    });

    it('the list is newest first and does not need the documents', async () => {
        const options = freshIndexedDb();
        const { adapter } = await openDexieStorage({ ...options, now });
        const a = { ...withTables(['a']), id: 'a', updatedAt: 100 };
        const b = { ...withTables(['b']), id: 'b', updatedAt: 300 };
        const c = { ...withTables(['c']), id: 'c', updatedAt: 200 };
        for (const d of [a, b, c]) await adapter.save(d);
        expect((await adapter.list()).map((s) => s.id)).toEqual([
            'b',
            'c',
            'a',
        ]);
    });
});

describe('DAT-002 / DAT-003 / DAT-004 / DAT-005 / DAT-006 a database from the oldest editor opens upgraded', () => {
    it('upgrades the old rows step by step, then moves them to the new layout without loss', async () => {
        const options = freshIndexedDb();
        await writeOldDatabase(options, 'QBase', 1, version1Rows);
        const { adapter, migration } = await openDexieStorage({
            ...options,
            now,
        });

        // the Dexie steps rewrote the old rows in place
        const tables = await adapter.db.db_tables.orderBy('id').toArray();
        const priceField = (tables[0].fields as Record<string, unknown>[])[1];
        expect(priceField.type).toEqual({
            id: 'double_precision',
            name: 'double precision',
        }); // DAT-003
        expect(priceField.nullable).toBe(true); // DAT-004
        expect(
            (tables[0].fields as Record<string, unknown>[])[0].nullable
        ).toBe(false);
        const rels = await adapter.db.db_relationships.orderBy('id').toArray();
        expect(rels.every((r) => !('type' in r))).toBe(true); // DAT-005
        const rel = (id: string) => rels.find((r) => r.id === id)!;
        expect([
            rel('rl1').sourceCardinality,
            rel('rl1').targetCardinality,
        ]).toEqual(['one', 'many']);
        expect([
            rel('rl2').sourceCardinality,
            rel('rl2').targetCardinality,
        ]).toEqual(['one', 'many']); // DAT-006
        expect([
            rel('rl3').sourceCardinality,
            rel('rl3').targetCardinality,
        ]).toEqual(['one', 'one']);
        // the version 12 step emptied the config; the first start made it again (data-format 2.4)
        expect((await adapter.readSettings()).defaultDiagramId).toBe('dg1');

        // and the new layout holds the same diagram
        expect(migration).toMatchObject({ ran: true, migrated: ['dg1'] });
        const loaded = (await adapter.load('dg1'))!.design;
        expect(loaded.name).toBe('Library');
        expect(loaded.createdAt).toBe(Date.parse('2025-01-02T03:04:05.000Z'));
        expect(listOf(loaded.entities).map((e) => e.name)).toEqual([
            'books',
            'loans',
        ]);
        expect(listOf(loaded.links)).toHaveLength(3);
        const books = listOf(loaded.entities)[0];
        expect(loaded.columns[books.columnIds[1]].type).toEqual({
            id: 'double_precision',
            name: 'double precision',
        });
    });

    it.each([2, 5, 8, 9, 13])(
        'a database left at version %i opens',
        async (version) => {
            const options = freshIndexedDb();
            const rows = JSON.parse(JSON.stringify(version1Rows));
            for (const r of rows.diagrams) {
                r.createdAt = new Date(r.createdAt);
                r.updatedAt = new Date(r.updatedAt);
            }
            await writeOldDatabase(options, 'QBase', version, rows);
            const { adapter } = await openDexieStorage({ ...options, now });
            const loaded = (await adapter.load('dg1'))!.design;
            expect(loaded.entities.order).toHaveLength(2);
            expect(
                listOf(loaded.links)
                    .map((l) => [l.sourceCardinality, l.targetCardinality])
                    .flat()
                    .includes('many')
            ).toBe(true);
        }
    );

    it('DAT-006 the version 14 step turns many/many rows into one/many', async () => {
        const options = freshIndexedDb();
        const rows = JSON.parse(JSON.stringify(version14Rows));
        rows.diagrams = [
            {
                id: 'dg9',
                name: 'x',
                databaseType: 'mysql',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ];
        rows.db_tables = [];
        rows.db_relationships = [
            {
                id: 'rm',
                diagramId: 'dg9',
                name: 'm',
                sourceTableId: 'a',
                sourceFieldId: 'b',
                targetTableId: 'c',
                targetFieldId: 'd',
                sourceCardinality: 'many',
                targetCardinality: 'many',
                createdAt: 1,
            },
        ];
        rows.db_dependencies = [];
        rows.areas = [];
        rows.db_custom_types = [];
        rows.notes = [];
        await writeOldDatabase(options, 'QBase', 13, rows);
        const { adapter } = await openDexieStorage({ ...options, now });
        const row = await adapter.db.db_relationships.get('rm');
        expect([row!.sourceCardinality, row!.targetCardinality]).toEqual([
            'one',
            'many',
        ]);
    });
});

describe('a diagram saved in the old layout migrates with no data loss', () => {
    it('keeps every collection, order, unknown keys, dependencies; drops the stray diagramId', async () => {
        const options = freshIndexedDb();
        await writeOldDatabase(options, 'QBase', 14, version14Rows);
        const { adapter, migration } = await openDexieStorage({
            ...options,
            now,
        });
        expect(migration.migrated.sort()).toEqual(['dg2', 'dg3']);

        const loaded = (await adapter.load('dg2'))!;
        expect(loaded.warnings).toEqual([]);
        const out = serialise(loaded.design);
        expect(out).toEqual({
            qbaseFormat: 1,
            id: 'dg2',
            name: 'Shop',
            databaseType: 'postgresql',
            databaseEdition: 'supabase',
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-02T00:00:00.000Z',
            tables: [
                // `order` decides: orders (0), customers (1), view (2)
                expect.objectContaining({ id: 'tb', name: 'orders', order: 0 }),
                expect.objectContaining({
                    id: 'ta',
                    name: 'customers',
                    order: 1,
                    comments: 'people',
                    width: 300,
                    parentAreaId: 'ar1',
                    mystery: { kept: true },
                    checkConstraints: [
                        { id: 'ck', expression: 'id > 0', createdAt: 7 },
                    ],
                }),
                expect.objectContaining({
                    id: 'tv',
                    isView: true,
                    isMaterializedView: true,
                    order: 2,
                }),
            ],
            // the old editor listed relationships alphabetically; that order is kept from now on
            relationships: [
                expect.objectContaining({ id: 'ra', name: 'aa_first' }),
                expect.objectContaining({
                    id: 'rb',
                    name: 'zz_last',
                    extraKey: 1,
                }),
            ],
            dependencies: [
                {
                    id: 'dp1',
                    schema: 'public',
                    tableId: 'tb',
                    dependentSchema: 'public',
                    dependentTableId: 'tv',
                    createdAt: 30,
                },
            ],
            areas: [
                expect.objectContaining({ id: 'ar1', name: 'Sales', order: 0 }),
            ],
            customTypes: [
                expect.objectContaining({
                    id: 'ca',
                    name: 'order_status',
                    values: ['new', 'paid'],
                    order: 0,
                }),
                expect.objectContaining({ id: 'cz', name: 'zebra', order: 1 }),
            ],
            notes: [expect.objectContaining({ id: 'nt', content: 'hello' })],
        });
        expect(JSON.stringify(out)).not.toContain('diagramId');
        const customers = (out.tables as Record<string, unknown>[])[1];
        const field = (customers.fields as Record<string, unknown>[])[1];
        expect(field).toMatchObject({ id: 'fb', isArray: true });
        expect(field).not.toHaveProperty('characterMaximumLength');

        const other = (await adapter.load('dg3'))!.design;
        expect(other.name).toBe('Other');
        expect(other.entities.order).toEqual(['tm']);
    });

    it('keeps the saved filter and the default diagram', async () => {
        const options = freshIndexedDb();
        await writeOldDatabase(options, 'QBase', 14, version14Rows);
        const { adapter } = await openDexieStorage({ ...options, now });
        expect(await adapter.readFilter('dg2')).toEqual({
            schemaIds: ['public'],
        }); // DAT-010
        expect(await adapter.readFilter('dg3')).toBeUndefined();
        expect(await adapter.readSettings()).toMatchObject({
            defaultDiagramId: 'dg3',
            exportActions: [new Date('2026-06-03T00:00:00.000Z')],
        }); // DAT-009
    });

    it('runs once: a marker is set and a second open changes nothing', async () => {
        const options = freshIndexedDb();
        await writeOldDatabase(options, 'QBase', 14, version14Rows);
        const first = await openDexieStorage({ ...options, now });
        expect(await first.adapter.db.meta.get(MIGRATION_MARKER)).toBeDefined();
        await first.adapter.save({
            ...(await first.adapter.load('dg3'))!.design,
            name: 'Edited later',
        });
        first.adapter.db.close();
        const second = await openDexieStorage({ ...options, now });
        expect(second.migration.ran).toBe(false);
        expect((await second.adapter.load('dg3'))!.design.name).toBe(
            'Edited later'
        );
        // the old stores are still there for a rollback
        expect(await second.adapter.db.diagrams.count()).toBe(2);
    });

    it('never overwrites a design that is already in the new layout', async () => {
        const options = freshIndexedDb();
        await writeOldDatabase(options, 'QBase', 14, version14Rows);
        const db = new QBaseDatabase('QBase', options);
        await db.open();
        const own = {
            ...parse(shop, { now }).design,
            id: 'dg2',
            name: 'Already new',
        };
        await db.designs.put({ id: 'dg2', doc: serialise(own) });
        db.close();
        const { adapter, migration } = await openDexieStorage({
            ...options,
            now,
        });
        expect(migration.skipped).toEqual(['dg2']);
        expect((await adapter.load('dg2'))!.design.name).toBe('Already new');
    });
});

describe('DAT-007 / DAT-008 the earlier database QubdiDB is merged and removed', () => {
    const old = (id: string, name: string) => ({
        id,
        name,
        databaseType: 'mysql',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const table = (id: string, diagramId: string) => ({
        id,
        diagramId,
        name: `t_${id}`,
        x: 0,
        y: 0,
        color: '#8eb7ff',
        createdAt: 1,
        isView: false,
        fields: [
            {
                id: `${id}f`,
                name: 'id',
                type: { id: 'int', name: 'int' },
                primaryKey: true,
                unique: true,
                nullable: false,
                createdAt: 1,
            },
        ],
        indexes: [],
    });

    it('DAT-007 adds rows it does not have, never overwrites, and deletes QubdiDB', async () => {
        const options = freshIndexedDb();
        await writeOldDatabase(options, 'QBase', 14, {
            diagrams: [old('same', 'Mine')],
            db_tables: [table('t1', 'same')],
        });
        await writeOldDatabase(options, 'QubdiDB', 14, {
            diagrams: [old('same', 'Theirs'), old('only', 'From the old name')],
            db_tables: [table('t1', 'same'), table('t2', 'only')],
        });
        const { adapter } = await openDexieStorage({ ...options, now });
        expect(await databaseExists(PREVIOUS_DATABASE_NAME, options)).toBe(
            false
        );
        expect((await adapter.load('same'))!.design.name).toBe('Mine');
        const only = (await adapter.load('only'))!.design;
        expect(only.name).toBe('From the old name');
        expect(only.entities.order).toEqual(['t2']);
        expect((await adapter.list()).map((s) => s.id).sort()).toEqual([
            'only',
            'same',
        ]);
    });

    it('DAT-007 an old QubdiDB version is upgraded first', async () => {
        const options = freshIndexedDb();
        await writeOldDatabase(options, 'QubdiDB', 1, version1Rows);
        const { adapter } = await openDexieStorage({ ...options, now });
        expect((await adapter.load('dg1'))!.design.name).toBe('Library');
        expect(await databaseExists(PREVIOUS_DATABASE_NAME, options)).toBe(
            false
        );
    });

    it('DAT-008 a failed move leaves QubdiDB untouched, merges nothing, and the next start retries', async () => {
        const options = freshIndexedDb();
        await writeOldDatabase(options, 'QubdiDB', 14, {
            diagrams: [old('a', 'A'), old('b', 'B')],
            db_tables: [table('t1', 'a')],
        });
        const db = new QBaseDatabase('QBase', options);
        await db.open();
        const add = vi
            .spyOn(db.table('db_tables'), 'add')
            .mockRejectedValue(new Error('disk full'));
        const warn = vi.fn();
        const outcome = await mergePreviousDatabase(db, options, warn);
        expect(outcome).toBe('failed');
        expect(warn).toHaveBeenCalled();
        expect(await databaseExists(PREVIOUS_DATABASE_NAME, options)).toBe(
            true
        );
        expect(await db.diagrams.count()).toBe(0); // the transaction rolled back as a whole
        add.mockRestore();
        db.close();

        const { adapter } = await openDexieStorage({ ...options, now });
        expect(await databaseExists(PREVIOUS_DATABASE_NAME, options)).toBe(
            false
        );
        expect((await adapter.list()).map((s) => s.id).sort()).toEqual([
            'a',
            'b',
        ]);
    });

    it('with no QubdiDB nothing happens', async () => {
        const options = freshIndexedDb();
        const db = new QBaseDatabase('QBase', options);
        await db.open();
        expect(await mergePreviousDatabase(db, options)).toBe('none');
    });
});

describe('first start (data-format 2.4)', () => {
    it('creates the config row with the first diagram, or an empty id', async () => {
        const empty = await openDexieStorage({ ...freshIndexedDb(), now });
        expect((await empty.adapter.readSettings()).defaultDiagramId).toBe('');
        const options = freshIndexedDb();
        await writeOldDatabase(options, 'QBase', 14, {
            diagrams: [
                {
                    id: 'b',
                    name: 'B',
                    databaseType: 'mysql',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: 'a',
                    name: 'A',
                    databaseType: 'mysql',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ],
        });
        const { adapter } = await openDexieStorage({ ...options, now });
        expect((await adapter.readSettings()).defaultDiagramId).toBe('a');
    });
});

function contract(label: string, make: () => Promise<StorageAdapter>) {
    describe(`storage adapter contract: ${label}`, () => {
        it('DAT-009 remembers the default diagram and export dates', async () => {
            const a = await make();
            expect((await a.readSettings()).defaultDiagramId).toBe('');
            await a.writeSettings({ defaultDiagramId: 'x' });
            await a.writeSettings({
                exportActions: [new Date('2026-01-01T00:00:00.000Z')],
            });
            expect(await a.readSettings()).toEqual({
                defaultDiagramId: 'x',
                exportActions: [new Date('2026-01-01T00:00:00.000Z')],
            });
        });

        it('DAT-010 a saved filter is remembered per diagram', async () => {
            const a = await make();
            expect(await a.readFilter('d1')).toBeUndefined();
            await a.writeFilter('d1', {
                schemaIds: ['public'],
                tableIds: ['t'],
            });
            await a.writeFilter('d2', { tableIds: [] });
            expect(await a.readFilter('d1')).toEqual({
                schemaIds: ['public'],
                tableIds: ['t'],
            });
            expect(await a.readFilter('d2')).toEqual({ tableIds: [] });
        });

        it('DAT-011 with no saved filter everything is shown at first', async () => {
            const a = await make();
            const design = parse(shop, { now }).design;
            const withSchemas = {
                ...design,
                entities: {
                    ...design.entities,
                    byId: {
                        ...design.entities.byId,
                        t2: { ...design.entities.byId.t2, schema: 'sales' },
                    },
                },
            };
            expect(await a.readFilter(design.id)).toBeUndefined();
            expect(withSchemas.filter).toBeUndefined();
        });

        it('DAT-013 deleting a diagram removes it, its filter, and resets it as default', async () => {
            const a = await make();
            const design = parse(shop, { now }).design;
            await a.save(design);
            await a.writeFilter(design.id, { tableIds: ['t1'] });
            await a.writeSettings({ defaultDiagramId: design.id });
            await a.remove(design.id);
            expect(await a.load(design.id)).toBeUndefined();
            expect(await a.list()).toEqual([]);
            expect(await a.readFilter(design.id)).toBeUndefined();
            expect((await a.readSettings()).defaultDiagramId).toBe('');
        });

        it('save replaces a design with the same id and load gives it back', async () => {
            const a = await make();
            const design = parse(shop, { now }).design;
            await a.save(design);
            await a.save({ ...design, name: 'Second' });
            expect((await a.list()).map((s) => s.name)).toEqual(['Second']);
            expect((await a.load(design.id))!.design.name).toBe('Second');
            expect(await a.load('nope')).toBeUndefined();
        });

        it('onChange fires after a save, not for the first read, and stops after unsubscribe', async () => {
            const a = await make();
            const calls = vi.fn();
            const stop = a.onChange(calls);
            await new Promise((r) => setTimeout(r, 20));
            expect(calls).not.toHaveBeenCalled();
            await a.save(parse(shop, { now }).design);
            await vi.waitFor(() => expect(calls).toHaveBeenCalled());
            stop();
            calls.mockClear();
            await a.save({ ...parse(shop, { now }).design, name: 'again' });
            await new Promise((r) => setTimeout(r, 20));
            expect(calls).not.toHaveBeenCalled();
        });

        it('loads through the tolerant parse (an open-only database still loads)', async () => {
            const a = await make();
            const design = {
                ...parse(shop, { now }).design,
                databaseType: 'oracle' as const,
                databaseEdition: undefined,
            };
            await a.save(design);
            expect((await a.load(design.id))!.design.databaseType).toBe(
                'oracle'
            );
        });
    });
}

describe('onChange reaches another tab', () => {
    it('a save in one adapter is announced to a listener in another on the same database', async () => {
        const options = freshIndexedDb();
        const one = (await openDexieStorage({ ...options, now })).adapter;
        const two = (await openDexieStorage({ ...options, now })).adapter;
        const calls = vi.fn();
        const stop = two.onChange(calls);
        await one.save(parse(shop, { now }).design);
        await vi.waitFor(() => expect(calls).toHaveBeenCalled());
        stop();
        expect((await two.list()).map((s) => s.id)).toEqual([
            parse(shop).design.id,
        ]);
    });
});

contract(
    'IndexedDB (Dexie)',
    async () => (await openDexieStorage({ ...freshIndexedDb(), now })).adapter
);
contract('memory', async () => new MemoryStorageAdapter());

describe('DAT-018 the app opens with defaults when the browser blocks storage', () => {
    it('falls back to memory when IndexedDB cannot open', async () => {
        const broken = {
            indexedDB: {
                open: () => {
                    throw new Error('blocked');
                },
                databases: async () => [],
            } as unknown as IDBFactory,
            IDBKeyRange,
        };
        const opened = await openStorage({ ...broken, now });
        expect(opened.volatile).toBe(true);
        expect(opened.error).toBeDefined();
        expect((await opened.adapter.readSettings()).defaultDiagramId).toBe('');
        await opened.adapter.save(parse(shop, { now }).design);
        expect(await opened.adapter.list()).toHaveLength(1);
    });

    it('a working IndexedDB is not volatile', async () => {
        expect((await openStorage({ ...freshIndexedDb(), now })).volatile).toBe(
            false
        );
    });
});

describe('review core-store 3: a late QubdiDB merge is migrated even after the marker', () => {
    it('migrates rows the merge copied when the marker was already set', async () => {
        const options = freshIndexedDb();
        // first start: no QubdiDB, the marker gets set
        const first = await openDexieStorage({ ...options, now });
        expect(first.migration.ran).toBe(true);
        first.adapter.close();
        // the earlier database appears afterwards
        await writeOldDatabase(options, 'QubdiDB', 14, {
            diagrams: [
                {
                    id: 'late',
                    name: 'Late',
                    databaseType: 'mysql',
                    createdAt: new Date('2026-01-01T00:00:00.000Z'),
                    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
                },
            ],
            db_tables: [],
        });
        const second = await openDexieStorage({ ...options, now });
        expect(second.migration.ran).toBe(true);
        expect(second.migration.migrated).toEqual(['late']);
        expect((await second.adapter.list()).map((s) => s.id)).toEqual([
            'late',
        ]);
        expect(await databaseExists(PREVIOUS_DATABASE_NAME, options)).toBe(
            false
        );
    });
});
