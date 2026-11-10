import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { listOf } from '../model/collection';
import { KEY_METHODS } from '../model/key';
import { looksLikeGeneratedId } from '../model/ids';
import { rng, NOW } from '../testing/helpers';
import { exportFileName, exportFileText } from './file-export';
import { ImportError, importFileText } from './file-import';
import { oracleFile } from './fixtures/other-databases';
import { oldStyle } from './fixtures/old-style';
import { shop } from './fixtures/shop';
import { parse } from './parse';
import { serialise, serialiseText } from './serialise';
import { upgrade } from './upgrade';

// the one place a fixture is allowed to be untyped: tests edit it by path
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fixture = any;

const read = (json: unknown) => parse(json, { now: NOW, random: rng() });

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('DAT-019 a diagram has id, name, type, edition and two dates', () => {
    it('reads them and writes them back', () => {
        const { design } = read(shop);
        expect(design.id).toBe('k3f9a1b2zx0q');
        expect(design.name).toBe('Shop');
        expect(design.databaseType).toBe('postgresql');
        expect(design.databaseEdition).toBe('supabase');
        expect(design.createdAt).toBe(Date.parse('2026-10-17T09:30:00.000Z'));
        expect(design.updatedAt).toBe(Date.parse('2026-10-17T09:31:12.000Z'));
        const out = serialise(design);
        expect(out.createdAt).toBe('2026-10-17T09:30:00.000Z');
        expect(out.updatedAt).toBe('2026-10-17T09:31:12.000Z');
    });

    it('replaces an unreadable date by now and says so', () => {
        const { design, warnings } = read(oldStyle);
        expect(design.updatedAt).toBe(NOW);
        expect(warnings.some((w) => w.path === 'updatedAt')).toBe(true);
    });
});

describe('DAT-020 / DAT-021 database types and editions', () => {
    it('accepts every stored type, including Oracle', () => {
        for (const type of [
            'postgresql',
            'mysql',
            'sql_server',
            'mariadb',
            'sqlite',
            'oracle',
        ]) {
            const { design, warnings } = read({
                ...shop,
                databaseType: type,
                databaseEdition: undefined,
            });
            expect(design.databaseType).toBe(type);
            expect(warnings.filter((w) => w.path === 'databaseType')).toEqual(
                []
            );
        }
    });

    it('treats an unknown type as PostgreSQL with a warning', () => {
        const { design, warnings } = read({ ...shop, databaseType: 'db2' });
        expect(design.databaseType).toBe('postgresql');
        expect(warnings.some((w) => w.path === 'databaseType')).toBe(true);
    });

    it('keeps an Oracle file unchanged on a round trip and edits it like any other design', () => {
        const { design } = read(oracleFile);
        expect(design.databaseType).toBe('oracle');
        const out = serialise(design);
        expect(out.databaseType).toBe('oracle');
        expect(out.tables).toEqual(
            oracleFile.tables.map((t, i) => ({ ...t, order: i }))
        );
    });

    it('drops an edition that does not fit the type', () => {
        const { design, warnings } = read({
            ...shop,
            databaseType: 'mysql',
            databaseEdition: 'supabase',
        });
        expect(design.databaseEdition).toBeUndefined();
        expect(warnings.some((w) => w.path === 'databaseEdition')).toBe(true);
        expect(
            read({
                ...shop,
                databaseType: 'mysql',
                databaseEdition: 'mysql_5_7',
            }).design.databaseEdition
        ).toBe('mysql_5_7');
    });
});

describe('DAT-024 missing child lists are empty', () => {
    it('reads a diagram with only the required keys', () => {
        const { design } = read({
            id: 'x',
            name: 'Bare',
            databaseType: 'sqlite',
        });
        expect(design.entities.order).toEqual([]);
        expect(design.links.order).toEqual([]);
        expect(design.userTypes.order).toEqual([]);
        expect(design.regions.order).toEqual([]);
        expect(design.memos.order).toEqual([]);
        expect(design.dependencies).toEqual([]);
        const out = serialise(design);
        for (const key of [
            'tables',
            'relationships',
            'dependencies',
            'areas',
            'customTypes',
            'notes',
        ])
            expect(out[key]).toEqual([]);
    });

    it('treats null like missing, for lists and for values', () => {
        const { design } = read({
            ...clone(shop),
            areas: null,
            tables: [
                {
                    ...clone(shop.tables[1]),
                    comments: null,
                    width: null,
                    schema: null,
                },
            ],
            relationships: null,
            dependencies: null,
        });
        const entity = listOf(design.entities)[0];
        expect(entity.comments).toBeUndefined();
        expect(entity.width).toBeUndefined();
        expect(entity.schema).toBeUndefined();
        expect(design.regions.order).toEqual([]);
    });
});

describe('DAT-002 / DAT-003 / DAT-004 / DAT-005 / DAT-006 old shapes open upgraded', () => {
    const { design, warnings } = read(oldStyle);
    const columnNamed = (table: string, name: string) => {
        const entity = listOf(design.entities).find((e) => e.name === table)!;
        return entity.columnIds
            .map((id) => design.columns[id])
            .find((c) => c.name === name)!;
    };

    it('DAT-003 a plain-text type becomes {id, name}', () => {
        expect(columnNamed('zeta', 'amount').type).toEqual({
            id: 'double_precision',
            name: 'double precision',
        });
        expect(columnNamed('zeta', 'id').type).toEqual({
            id: 'int',
            name: 'int',
        });
    });

    it('DAT-004 nullable text becomes a boolean, in any letter case', () => {
        expect(columnNamed('zeta', 'id').nullable).toBe(false);
        expect(columnNamed('zeta', 'amount').nullable).toBe(true);
        expect(columnNamed('alpha', 'zeta_id').nullable).toBe(true);
    });

    it('DAT-005 the relationship type text becomes two cardinalities', () => {
        const byName = (n: string) =>
            listOf(design.links).find((l) => l.name === n)!;
        // many_to_one stays many/one (only many/many is rewritten)
        expect([
            byName('second').sourceCardinality,
            byName('second').targetCardinality,
        ]).toEqual(['many', 'one']);
        // a missing type counts as one_to_one
        expect(byName('third')).toMatchObject({
            sourceCardinality: 'one',
            targetCardinality: 'one',
        });
    });

    it('DAT-006 many to many opens as one to many', () => {
        const link = listOf(design.links).find(
            (l) => l.name === 'alpha_zeta_id_fk'
        )!;
        expect([link.sourceCardinality, link.targetCardinality]).toEqual([
            'one',
            'many',
        ]);
        expect(warnings.some((w) => w.message.includes('many to many'))).toBe(
            true
        );
        const both = read({
            ...clone(shop),
            relationships: [
                {
                    ...clone(shop.relationships[0]),
                    sourceCardinality: 'many',
                    targetCardinality: 'many',
                },
            ],
        }).design;
        const only = listOf(both.links)[0];
        expect([only.sourceCardinality, only.targetCardinality]).toEqual([
            'one',
            'many',
        ]);
    });

    it('DAT-002 an upgrade never writes the legacy keys back', () => {
        const out = serialise(design);
        const text = JSON.stringify(out);
        expect(text).not.toContain('"type":"int"');
        const rels = out.relationships as Record<string, unknown>[];
        for (const rel of rels) expect(rel).not.toHaveProperty('type');
    });

    it('drops a relationship whose table is gone, with a warning (DAT-063 on read)', () => {
        expect(listOf(design.links).map((l) => l.name)).not.toContain(
            'dangling'
        );
        expect(warnings.some((w) => w.path === 'relationships[3]')).toBe(true);
    });

    it('upgrade() alone leaves current input alone', () => {
        const { json, fromVersion } = upgrade(shop);
        expect(fromVersion).toBe(1);
        expect(json.tables).toEqual(shop.tables);
    });

    it('refuses input that is not an object', () => {
        expect(() => parse('nope')).toThrow();
        expect(() => parse([])).toThrow();
    });
});

describe('DAT-012 relationships keep the stored order, not alphabetical order', () => {
    it('keeps the file order of relationships and custom types by order', () => {
        const file = clone(shop);
        file.relationships = [
            { ...file.relationships[0], id: 'rz', name: 'zzz' },
            {
                ...file.relationships[0],
                id: 'ra',
                name: 'aaa',
                targetFieldId: 'f11',
            },
        ];
        const { design } = read(file);
        expect(listOf(design.links).map((l) => l.name)).toEqual(['zzz', 'aaa']);
    });
});

describe('DAT-032 / DAT-057 order of tables and side lists', () => {
    it('DAT-032 serialising writes order for every table, equal to list position', () => {
        const { design } = read(oldStyle);
        const tables = serialise(design).tables as {
            name: string;
            order: number;
        }[];
        expect(tables.map((t) => t.order)).toEqual([0, 1, 2]);
    });

    it('DAT-032 / EDT-106 without any order, tables come before views, then by name', () => {
        const { design } = read(oldStyle);
        expect(listOf(design.entities).map((e) => e.name)).toEqual([
            'alpha',
            'zeta',
            'a_view',
        ]);
    });

    it('DAT-032 with order hints, the hints decide and a missing order counts as 0', () => {
        const file = clone(shop);
        (file.tables[0] as { order?: number }).order = 5;
        delete (file.tables[1] as { order?: number }).order;
        file.tables[2].order = 1;
        const { design } = read(file);
        expect(listOf(design.entities).map((e) => e.id)).toEqual([
            't2',
            't3',
            't1',
        ]);
        const out = serialise(design).tables as { id: string; order: number }[];
        expect(out.map((t) => [t.id, t.order])).toEqual([
            ['t2', 0],
            ['t3', 1],
            ['t1', 2],
        ]);
    });

    it('DAT-057 areas, notes and custom types: numbered first ascending, the rest after', () => {
        const file = clone(shop);
        file.customTypes = [
            { id: 'u', name: 'u', kind: 'enum', values: [] } as never,
            { id: 'b', name: 'b', kind: 'enum', values: [], order: 5 } as never,
            { id: 'a', name: 'a', kind: 'enum', values: [], order: 2 } as never,
            { id: 'v', name: 'v', kind: 'enum', values: [] } as never,
        ];
        const { design } = read(file);
        expect(design.userTypes.order).toEqual(['a', 'b', 'u', 'v']);
        const out = serialise(design).customTypes as {
            id: string;
            order: number;
        }[];
        expect(out.map((t) => t.order)).toEqual([0, 1, 2, 3]);
    });
});

describe('DAT-034 / DAT-040 column length and legacy check', () => {
    const lengthOf = (value: unknown) => {
        const file = clone(shop);
        (
            file.tables[0].fields[1] as Record<string, unknown>
        ).characterMaximumLength = value;
        const { design, warnings } = read(file);
        return { length: design.columns.f2.length, warnings };
    };

    it('reads text numbers as numbers and writes them back as text', () => {
        expect(lengthOf('255').length).toBe(255);
        const out = serialise(read(shop).design);
        const field = (
            (out.tables as Record<string, unknown>[])[0].fields as Record<
                string,
                unknown
            >[]
        )[1];
        expect(field.characterMaximumLength).toBe('255');
    });

    it('keeps max', () => {
        expect(lengthOf('max').length).toBe('max');
        expect(lengthOf('MAX').length).toBe('max');
    });

    it('the text "null" and empty text mean no length', () => {
        expect(lengthOf('null').length).toBeUndefined();
        expect(lengthOf('').length).toBeUndefined();
        expect(lengthOf(null).length).toBeUndefined();
    });

    it('a number given as a number is accepted; rubbish is ignored with a warning', () => {
        expect(lengthOf(40).length).toBe(40);
        const bad = lengthOf('lots');
        expect(bad.length).toBeUndefined();
        expect(bad.warnings.length).toBeGreaterThan(0);
    });

    it('DAT-040 the column-level check is kept and written back', () => {
        const { design } = read(shop);
        expect(design.columns.f3.check).toBe('length(tags) > 0');
        const out = serialise(design);
        const field = (
            (out.tables as Record<string, unknown>[])[0].fields as Record<
                string,
                unknown
            >[]
        )[2];
        expect(field.check).toBe('length(tags) > 0');
    });
});

describe('DAT-033 / DAT-025 / DAT-041 / DAT-046 / DAT-051 / DAT-053 round trip of a full file', () => {
    it('writes back exactly what it read, unknown keys included', () => {
        const { design, warnings } = read(shop);
        expect(warnings).toEqual([]);
        expect(serialise(design)).toEqual(shop);
    });

    it('survives text and a second round', () => {
        const first = read(JSON.parse(serialiseText(read(shop).design))).design;
        expect(serialise(first)).toEqual(shop);
    });

    it('DAT-025 holds all the table keys', () => {
        const entity = listOf(read(shop).design.entities)[0];
        expect(entity).toMatchObject({
            id: 't1',
            name: 'customers',
            schema: 'public',
            x: 120,
            y: 80,
            kind: 'table',
            color: '#8eb7ff',
            createdAt: 1760693400000,
            width: 300,
            comments: 'People who buy things',
            expanded: true,
            regionId: 'a1',
        });
        expect(entity.columnIds).toEqual(['f1', 'f2', 'f3']);
        expect(entity.keyIds).toEqual(['i1', 'i2']);
        expect(entity.ruleIds).toEqual(['c1']);
    });

    it('DAT-025 a view may be materialized', () => {
        const view = read(shop).design.entities.byId.t3;
        expect(view.kind).toBe('view');
        expect(view.materialized).toBe(true);
    });

    it('DAT-033 a column keeps every key', () => {
        expect(read(shop).design.columns.f2).toMatchObject({
            name: 'email',
            type: { id: 'varchar', name: 'varchar' },
            length: 255,
            primaryKey: false,
            unique: true,
            nullable: false,
            default: "''",
            collation: 'C',
            comments: 'login name',
            extra: { futureFieldFlag: 'x' },
        });
        expect(read(shop).design.columns.f20).toMatchObject({
            precision: 12,
            scale: 2,
        });
        expect(read(shop).design.columns.f1.increment).toBe(true);
        expect(read(shop).design.columns.f3.isArray).toBe(true);
    });

    it('DAT-041 an index keeps its keys', () => {
        const key = read(shop).design.keys.i2;
        expect(key).toMatchObject({
            label: 'customers_tags_idx',
            distinct: false,
            members: ['f3'],
            algorithm: 'gin',
        });
        expect(read(shop).design.keys.i1.pk).toBe(true);
    });

    it('DAT-046 a link keeps its keys', () => {
        expect(read(shop).design.links.byId.r1).toMatchObject({
            name: 'orders_customer_id_fk',
            sourceEntityId: 't1',
            sourceColumnId: 'f1',
            targetEntityId: 't2',
            targetColumnId: 'f10',
            sourceSchema: 'public',
            targetSchema: 'public',
            sourceCardinality: 'one',
            targetCardinality: 'many',
        });
    });

    it('DAT-051 check constraints', () => {
        expect(read(shop).design.rules.c1).toMatchObject({
            expression: "email <> ''",
        });
    });

    it('DAT-053 enum and composite custom types', () => {
        const { design } = read(shop);
        expect(design.userTypes.byId.ct1).toMatchObject({
            kind: 'enum',
            values: ['new', 'paid', 'shipped'],
            schema: 'public',
        });
        expect(design.userTypes.byId.ct2).toMatchObject({
            kind: 'composite',
            members: [
                { name: 'street', type: 'text' },
                { name: 'zip', type: 'varchar(10)' },
            ],
        });
    });

    it('DAT-055 / DAT-056 areas and notes', () => {
        const { design } = read(shop);
        expect(design.regions.byId.a1).toMatchObject({
            label: 'Sales',
            box: { x: 60, y: 20, width: 700, height: 400 },
        });
        expect(design.memos.byId.n1).toMatchObject({
            body: 'Check with finance',
            tint: '#ffe374',
        });
    });
});

describe('DAT-045 every stored index type still loads', () => {
    it('keeps each known method', () => {
        for (const method of KEY_METHODS) {
            const file = clone(shop);
            (file.tables[0].indexes[1] as Record<string, unknown>).type =
                method;
            const { design, warnings } = read(file);
            expect(design.keys.i2.algorithm).toBe(method);
            expect(warnings).toEqual([]);
        }
    });

    it('keeps an unknown method aside and writes it back', () => {
        const file = clone(shop);
        (file.tables[0].indexes[1] as Record<string, unknown>).type = 'rtree';
        const { design, warnings } = read(file);
        expect(design.keys.i2.algorithm).toBeUndefined();
        expect(warnings.length).toBe(1);
        const out = serialise(design);
        const index = (
            (out.tables as Record<string, unknown>[])[0].indexes as Record<
                string,
                unknown
            >[]
        )[1];
        expect(index.type).toBe('rtree');
    });
});

describe('DAT-052 dependencies load and are written back unchanged', () => {
    it('keeps the list as it was', () => {
        const { design } = read(shop);
        expect(design.dependencies).toEqual([
            {
                id: 'd1',
                schema: 'public',
                tableId: 't2',
                dependentSchema: 'public',
                dependentTableId: 't3',
                createdAt: 1760693600000,
            },
        ]);
        expect(serialise(design).dependencies).toEqual(shop.dependencies);
    });

    it('keeps unknown keys on a dependency', () => {
        const file = clone(shop);
        (file.dependencies[0] as Record<string, unknown>).note = 'x';
        expect(serialise(read(file).design).dependencies).toEqual(
            file.dependencies
        );
    });
});

describe('DAT-059 ids', () => {
    it('makes a 25-character id for a record that has none, or a repeated one', () => {
        const file = clone(shop);
        delete (file.tables[1] as Record<string, unknown>).id;
        (file.tables[2] as Record<string, unknown>).id = 't1';
        const { design, warnings } = read(file);
        const ids = design.entities.order;
        expect(new Set(ids).size).toBe(3);
        expect(ids.filter((id) => looksLikeGeneratedId(id)).length).toBe(2);
        expect(warnings.length).toBeGreaterThanOrEqual(2);
    });

    it('opens old ids of any shape unchanged', () => {
        expect(read(oldStyle).design.entities.order).toContain('a');
    });
});

describe('DAT-064 the version key', () => {
    it('is written on every output', () => {
        expect(serialise(read(shop).design).qbaseFormat).toBe(1);
        expect(JSON.parse(exportFileText(read(shop).design)).qbaseFormat).toBe(
            1
        );
    });

    it('a file without the key opens as version 1', () => {
        const old = clone(shop) as Record<string, unknown>;
        delete old.qbaseFormat;
        expect(upgrade(old).fromVersion).toBe(1);
        expect(read(old).design.name).toBe('Shop');
    });

    it('a newer file opens with a warning and keeps what it does not know', () => {
        const { warnings, design } = read({ ...clone(shop), qbaseFormat: 9 });
        expect(warnings.some((w) => w.path === 'qbaseFormat')).toBe(true);
        expect(design.name).toBe('Shop');
    });
});

describe('DAT-089 the stray diagramId is dropped on read', () => {
    it('is gone from every row and never written', () => {
        const { design } = read(oldStyle);
        expect(JSON.stringify(serialise(design))).not.toContain('diagramId');
        expect(listOf(design.entities)[0].extra).toBeUndefined();
    });
});

describe('DAT-072 / DAT-082 the output is accepted by the server', () => {
    // the same checks as server/src/diagrams/routes.ts (diagramContent)
    const content = z.looseObject({
        id: z.string().max(200).optional(),
        name: z.string().max(500).optional(),
        databaseType: z.string().max(50).optional(),
        databaseEdition: z.string().max(50).optional(),
        tables: z.array(z.unknown()).optional(),
        relationships: z.array(z.unknown()).optional(),
        dependencies: z.array(z.unknown()).optional(),
        areas: z.array(z.unknown()).optional(),
        customTypes: z.array(z.unknown()).optional(),
        notes: z.array(z.unknown()).optional(),
    });

    it('DAT-072 passes the server schema, unknown keys included', () => {
        const parsed = content.parse(
            JSON.parse(serialiseText(read(shop).design))
        );
        expect(parsed.futureTopLevel).toBe('keep me');
    });

    it('DAT-072 passes for old-style and open-only files too', () => {
        for (const file of [oldStyle, oracleFile])
            expect(() =>
                content.parse(serialise(read(file).design))
            ).not.toThrow();
    });

    it('DAT-082 keeps the real ids', () => {
        const out = serialise(read(shop).design);
        expect((out.tables as { id: string }[]).map((t) => t.id)).toEqual([
            't1',
            't2',
            't3',
        ]);
        expect(out.id).toBe('k3f9a1b2zx0q');
    });
});

describe('DAT-061 / DAT-062 / DAT-063 / DAT-065 export file', () => {
    it('DAT-061 the file name and the 2-space indent', () => {
        const { design } = read(shop);
        expect(exportFileName(design)).toBe('QBase(Shop).json');
        const text = exportFileText(design);
        expect(text.split('\n')[1]).toMatch(/^ {2}"/);
        expect(text).not.toContain('\t');
    });

    it('DAT-062 ids become counters and every reference follows', () => {
        const out = JSON.parse(exportFileText(read(shop).design));
        const ids: string[] = [];
        const collect = (value: unknown) => {
            if (Array.isArray(value)) value.forEach(collect);
            else if (value && typeof value === 'object') {
                const rec = value as Record<string, unknown>;
                if (typeof rec.id === 'string') ids.push(rec.id);
                for (const [k, v] of Object.entries(rec))
                    if (k !== 'type') collect(v);
            }
        };
        collect(out);
        // check constraint ids are kept; everything else is a decimal counter
        const numeric = ids.filter((id) => /^\d+$/.test(id));
        expect(numeric.length).toBe(ids.length - 1);
        expect(ids).toContain('c1');
        expect(new Set(ids).size).toBe(ids.length);

        const tableIds = out.tables.map((t: { id: string }) => t.id);
        const fieldIds = out.tables.flatMap((t: { fields: { id: string }[] }) =>
            t.fields.map((f) => f.id)
        );
        const rel = out.relationships[0];
        expect(tableIds).toContain(rel.sourceTableId);
        expect(tableIds).toContain(rel.targetTableId);
        expect(fieldIds).toContain(rel.sourceFieldId);
        expect(fieldIds).toContain(rel.targetFieldId);
        const source = out.tables.find(
            (t: { id: string }) => t.id === rel.sourceTableId
        );
        expect(source.name).toBe('customers');
        expect(
            source.fields.find(
                (f: { id: string }) => f.id === rel.sourceFieldId
            ).name
        ).toBe('id');
        expect(out.tables[0].indexes[1].fieldIds).toEqual([
            source.fields[2].id,
        ]);
        expect(out.tables[0].parentAreaId).toBe(out.areas[0].id);
        const dep = out.dependencies[0];
        expect(
            out.tables.find((t: { id: string }) => t.id === dep.tableId).name
        ).toBe('orders');
    });

    it('DAT-062 the primary-key index is exported without a name', () => {
        const file = clone(shop);
        file.tables[0].indexes[0].name = 'pk_customers';
        const out = JSON.parse(exportFileText(read(file).design));
        expect(out.tables[0].indexes[0].name).toBe('');
    });

    it('DAT-063 a dependency with a missing end is left out', () => {
        const file = clone(shop);
        file.dependencies.push({
            id: 'd2',
            tableId: 't2',
            dependentTableId: 'gone',
            createdAt: 1,
        } as never);
        const out = JSON.parse(exportFileText(read(file).design));
        expect(out.dependencies).toHaveLength(1);
    });

    it('DAT-065 holds no filter, config or diagramId', () => {
        const text = exportFileText(read(shop).design);
        for (const word of [
            'schemaIds',
            'tableIds',
            'defaultDiagramId',
            'exportActions',
            'diagramId',
        ])
            expect(text).not.toContain(word);
    });

    it('an exported file imports again to the same content', () => {
        const first = read(shop).design;
        const again = importFileText(exportFileText(first), {
            now: NOW,
            random: rng(3),
        }).design;
        const names = (d: typeof first) =>
            listOf(d.entities).map((e) => [
                e.name,
                e.columnIds.map((c) => d.columns[c].name),
            ]);
        expect(names(again)).toEqual(names(first));
        expect(listOf(again.links)).toHaveLength(1);
        expect(again.userTypes.order).toHaveLength(2);
    });
});

describe('DAT-066 / DAT-067 / DAT-068 / DAT-069 import', () => {
    it('DAT-066 a new diagram: fresh ids, fresh dates', () => {
        const { design } = importFileText(JSON.stringify(shop), {
            now: NOW,
            random: rng(11),
        });
        expect(design.id).not.toBe(shop.id);
        expect(looksLikeGeneratedId(design.id)).toBe(true);
        expect(design.createdAt).toBe(NOW);
        expect(design.updatedAt).toBe(NOW);
        for (const id of design.entities.order)
            expect(looksLikeGeneratedId(id)).toBe(true);
        for (const id of Object.keys(design.columns))
            expect(looksLikeGeneratedId(id)).toBe(true);
        expect(design.entities.byId.t1).toBeUndefined();
        // references were rewritten with the ids
        const link = listOf(design.links)[0];
        expect(design.entities.byId[link.sourceEntityId].name).toBe(
            'customers'
        );
        expect(design.columns[link.targetColumnId].name).toBe('customer_id');
        const customers = listOf(design.entities)[0];
        expect(customers.regionId).toBe(design.regions.order[0]);
        // the primary-key index is unnamed
        expect(design.keys[customers.keyIds[0]].label).toBe('');
    });

    it('DAT-067 refuses text that is not JSON', () => {
        expect(() => importFileText('{oops')).toThrow(ImportError);
    });

    it('DAT-067 refuses a file with a missing required key', () => {
        const file = clone(shop);
        delete (file.tables[0] as Record<string, unknown>).x;
        expect(() => importFileText(JSON.stringify(file))).toThrow(ImportError);
        try {
            importFileText(JSON.stringify(file));
        } catch (e) {
            expect((e as ImportError).problems.join()).toContain('tables[0].x');
        }
    });

    it.each([
        [
            'an unknown database type',
            (f: Record<string, unknown>) => (f.databaseType = 'db2'),
        ],
        [
            'an unknown edition',
            (f: Record<string, unknown>) => (f.databaseEdition = 'x'),
        ],
        [
            'nullable as text',
            (f: Fixture) => (f.tables[0].fields[0].nullable = 'true'),
        ],
        [
            'a type as text',
            (f: Fixture) => (f.tables[0].fields[0].type = 'int'),
        ],
        [
            'an unknown cardinality',
            (f: Fixture) => (f.relationships[0].sourceCardinality = 'few'),
        ],
        [
            'a wrong custom type kind',
            (f: Fixture) => (f.customTypes[0].kind = 'range'),
        ],
        [
            'an unknown index type',
            (f: Fixture) => (f.tables[0].indexes[1].type = 'rtree'),
        ],
        ['tables that are not a list', (f: Fixture) => (f.tables = {})],
        ['a null order on an area', (f: Fixture) => (f.areas[0].order = null)],
        ['a missing id', (f: Fixture) => delete f.id],
    ])('DAT-067 refuses %s', (_name, mutate) => {
        const file = clone(shop);
        mutate(file as never);
        expect(() => importFileText(JSON.stringify(file))).toThrow(ImportError);
    });

    it('DAT-067 refuses something that is not an object', () => {
        expect(() => importFileText('[]')).toThrow(ImportError);
        expect(() => importFileText('"x"')).toThrow(ImportError);
    });

    it('DAT-068 drops unknown keys', () => {
        const { design } = importFileText(JSON.stringify(shop), { now: NOW });
        expect(design.extra).toBeUndefined();
        expect(
            design.columns[listOf(design.entities)[0].columnIds[1]].extra
        ).toBeUndefined();
        expect(JSON.stringify(serialise(design))).not.toContain('future');
    });

    it('DAT-069 a file from the earlier editor has the same shape and opens', () => {
        const earlier = clone(shop) as Record<string, unknown>;
        delete earlier.qbaseFormat;
        expect(importFileText(JSON.stringify(earlier)).design.name).toBe(
            'Shop'
        );
        expect(exportFileName({ name: 'Shop' })).toBe('QBase(Shop).json');
    });

    it('DAT-066 a link or dependency with a missing end is left out of the import', () => {
        const file = clone(shop);
        file.relationships.push({
            ...file.relationships[0],
            id: 'rx',
            targetTableId: 'nope',
        });
        file.dependencies.push({
            id: 'dx',
            tableId: 't1',
            dependentTableId: 'nope',
            createdAt: 1,
        } as never);
        const { design } = importFileText(JSON.stringify(file));
        expect(design.links.order).toHaveLength(1);
        expect(design.dependencies).toHaveLength(1);
    });
});
