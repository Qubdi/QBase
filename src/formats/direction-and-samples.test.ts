/**
 * Phase 9 data checks.
 *
 * Part A settles data-format Q13 (which end of a relationship is source and
 * which is target) from the spec text and shows that wire, model, SQL and
 * DBML agree. Part B runs the sample inputs and outputs of
 * rewrite/spec/import-export.md section 10 through the code.
 */
import { describe, expect, it } from 'vitest';
import { listOf } from '@/core/model/collection';
import type { Design } from '@/core/model/design';
import { importFileText } from '@/core/wire/file-import';
import { parse } from '@/core/wire/parse';
import { serialise } from '@/core/wire/serialise';
import {
    sampleS1,
    sampleS2,
    sampleS3,
} from '@/dialects/testing/sample-designs';
import { exportDbml } from './dbml/export-dbml';
import { importDbml } from './dbml/import-dbml';
import { diagramFile } from './file/diagram-file';
import { exportSql } from './sql/export-sql';
import { importSql } from './sql/import-sql';

const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);
type Row = Record<string, unknown>;

// ---------------------------------------------------------------- Part A

const col = (id: string, name: string, extra: Row = {}): Row => ({
    id,
    name,
    type: { id: 'integer', name: 'integer' },
    primaryKey: false,
    unique: false,
    nullable: false,
    createdAt: 1,
    ...extra,
});

/** customers.id is the referenced column; orders.customer_id holds the key. */
function wireDoc(rel: Row, ordersKeyUnique = false): Row {
    return {
        id: 'd1',
        name: 'dir',
        databaseType: 'postgresql',
        createdAt: '2026-11-07T12:00:00.000Z',
        updatedAt: '2026-11-07T12:00:00.000Z',
        tables: [
            {
                id: 'cust',
                name: 'customers',
                x: 0,
                y: 0,
                color: '#8eb7ff',
                isView: false,
                createdAt: 1,
                fields: [col('c_id', 'id', { primaryKey: true, unique: true })],
                indexes: [
                    {
                        id: 'ci',
                        name: '',
                        unique: true,
                        fieldIds: ['c_id'],
                        isPrimaryKey: true,
                        createdAt: 1,
                    },
                ],
            },
            {
                id: 'ord',
                name: 'orders',
                x: 400,
                y: 0,
                color: '#8eb7ff',
                isView: false,
                createdAt: 1,
                fields: [
                    col('o_id', 'id', { primaryKey: true, unique: true }),
                    col('o_cust', 'customer_id', { unique: ordersKeyUnique }),
                ],
                indexes: [
                    {
                        id: 'oi',
                        name: '',
                        unique: true,
                        fieldIds: ['o_id'],
                        isPrimaryKey: true,
                        createdAt: 1,
                    },
                ],
            },
        ],
        relationships: [
            {
                id: 'r1',
                name: 'orders_customer_id_fk',
                createdAt: 2,
                ...rel,
            },
        ],
        dependencies: [],
        areas: [],
        customTypes: [],
        notes: [],
    };
}

/** The usual foreign key as the old editor stores it: source = referenced. */
const USUAL = {
    sourceTableId: 'cust',
    sourceFieldId: 'c_id',
    targetTableId: 'ord',
    targetFieldId: 'o_cust',
    sourceCardinality: 'one',
    targetCardinality: 'many',
};
/** The same key written the other way round: source = holder, many/one. */
const REVERSED = {
    sourceTableId: 'ord',
    sourceFieldId: 'o_cust',
    targetTableId: 'cust',
    targetFieldId: 'c_id',
    sourceCardinality: 'many',
    targetCardinality: 'one',
};
const ONE_TO_ONE = { ...USUAL, targetCardinality: 'one' };

function designOf(rel: Row, unique = false, warnings: unknown[] = []): Design {
    const r = parse(wireDoc(rel, unique), { now: NOW });
    expect(r.warnings).toEqual(warnings);
    return r.design;
}

/** which table holds the foreign key, read from the SQL text */
function holderFromSql(sql: string): { holder: string; target: string } {
    const m =
        /ALTER TABLE\s+\S*?["`[]?(\w+)["`\]]?\s+ADD CONSTRAINT[\s\S]*?REFERENCES\s+\S*?["`[]?(\w+)["`\]]?\s*\(/.exec(
            sql
        );
    if (!m) throw new Error('no foreign key in\n' + sql);
    return { holder: m[1], target: m[2] };
}

describe('Q13 relationship direction: source is the referenced table, target holds the key', () => {
    it('wire parse -> model -> serialise keeps direction and cardinality', () => {
        for (const rel of [USUAL, REVERSED, ONE_TO_ONE]) {
            const design = designOf(rel);
            const link = listOf(design.links)[0];
            expect(design.entities.byId[link.sourceEntityId].name).toBe(
                rel.sourceTableId === 'cust' ? 'customers' : 'orders'
            );
            expect(design.entities.byId[link.targetEntityId].name).toBe(
                rel.targetTableId === 'cust' ? 'customers' : 'orders'
            );
            expect(link.sourceCardinality).toBe(rel.sourceCardinality);
            expect(link.targetCardinality).toBe(rel.targetCardinality);
            const out = serialise(design);
            const back = (out.relationships as Row[])[0];
            expect(back).toMatchObject({
                sourceTableId: rel.sourceTableId,
                sourceFieldId: rel.sourceFieldId,
                targetTableId: rel.targetTableId,
                targetFieldId: rel.targetFieldId,
                sourceCardinality: rel.sourceCardinality,
                targetCardinality: rel.targetCardinality,
            });
            // and again through JSON text
            const again = parse(JSON.parse(JSON.stringify(out)), { now: NOW });
            expect(serialise(again.design)).toEqual(out);
        }
    });

    it('many/many is turned into one/many without swapping the ends', () => {
        const design = designOf(
            {
                ...USUAL,
                sourceCardinality: 'many',
                targetCardinality: 'many',
            },
            false,
            [
                {
                    path: 'relationships[0]',
                    message:
                        'many to many does not exist; changed to one to many',
                },
            ]
        );
        const link = listOf(design.links)[0];
        expect(link.sourceCardinality).toBe('one');
        expect(link.targetCardinality).toBe('many');
        expect(design.entities.byId[link.sourceEntityId].name).toBe(
            'customers'
        );
    });

    it.each(['postgresql', 'mysql', 'sql_server', 'sqlite'] as const)(
        '%s export writes the key on the holder whatever the stored direction',
        (type) => {
            for (const rel of [USUAL, REVERSED, ONE_TO_ONE]) {
                const design = { ...designOf(rel, true), databaseType: type };
                const sql = exportSql(design, type).text;
                if (type === 'sqlite') {
                    // sqlite writes the key inside the table that holds it
                    const orders = /CREATE TABLE[^(]*"orders"[\s\S]*?\);/.exec(
                        sql
                    )![0];
                    expect(orders).toMatch(
                        /FOREIGN KEY\("customer_id"\) REFERENCES "customers"\("id"\)/
                    );
                    const customers =
                        /CREATE TABLE[^(]*"customers"[\s\S]*?\);/.exec(sql)![0];
                    expect(customers).not.toContain('FOREIGN KEY');
                } else {
                    expect(holderFromSql(sql)).toEqual({
                        holder: 'orders',
                        target: 'customers',
                    });
                }
            }
        }
    );

    it('DBML export orders the Ref by direction and symbol', () => {
        const ref = (d: Design) =>
            exportDbml(d)
                .text.split('\n')
                .find((l) => l.startsWith('Ref'))!;
        expect(ref(designOf(USUAL))).toMatch(
            /"customers"\."id" < "orders"\."customer_id"$/
        );
        expect(ref(designOf(REVERSED))).toMatch(
            /"orders"\."customer_id" > "customers"\."id"$/
        );
        expect(ref(designOf(ONE_TO_ONE, true))).toMatch(
            /"customers"\."id" - "orders"\."customer_id"$/
        );
    });

    it('DBML inline form puts the reference on the holder column', () => {
        for (const rel of [USUAL, REVERSED]) {
            const text = exportDbml(designOf(rel), { inline: true }).text;
            const orders = /Table "orders" \{[\s\S]*?\n\}/.exec(text)![0];
            expect(orders).toMatch(
                /"customer_id" integer \[not null, ref: > "customers"\."id"\]/
            );
            const customers = /Table "customers" \{[\s\S]*?\n\}/.exec(text)![0];
            expect(customers).not.toContain('ref:');
        }
    });

    it('SQL export -> SQL import gives source = referenced, target = holder, one/many', () => {
        for (const rel of [USUAL, REVERSED]) {
            for (const type of ['postgresql', 'mysql', 'sql_server'] as const) {
                const sql = exportSql(
                    { ...designOf(rel), databaseType: type },
                    type
                ).text;
                const back = importSql(sql, type).design!;
                const link = listOf(back.links)[0];
                expect(back.entities.byId[link.sourceEntityId].name).toBe(
                    'customers'
                );
                expect(back.entities.byId[link.targetEntityId].name).toBe(
                    'orders'
                );
                expect(link.sourceCardinality).toBe('one');
                expect(link.targetCardinality).toBe('many');
            }
        }
    });

    it('DBML export -> DBML import keeps which end holds the key, for every stored direction', () => {
        for (const [rel, unique] of [
            [USUAL, false],
            [REVERSED, false],
            [ONE_TO_ONE, true],
        ] as const) {
            for (const inline of [false, true]) {
                const first = designOf(rel, unique);
                const text = exportDbml(first, { inline }).text;
                const r = importDbml(text, 'postgresql');
                expect(r.diagnostics).toEqual([]);
                const back = listOf(r.design!.links)[0];
                const was = listOf(first.links)[0];
                const names = (d: Design, id: string) =>
                    d.entities.byId[id].name;
                // the holder is the target unless the link is many/one
                const holder = (d: Design, l: typeof was) =>
                    l.sourceCardinality === 'many' &&
                    l.targetCardinality === 'one'
                        ? names(d, l.sourceEntityId)
                        : names(d, l.targetEntityId);
                expect(holder(r.design!, back)).toBe(holder(first, was));
                expect(holder(r.design!, back)).toBe('orders');
                if (!inline) {
                    // standard form also keeps source and target as they were
                    expect(names(r.design!, back.sourceEntityId)).toBe(
                        names(first, was.sourceEntityId)
                    );
                    expect(back.sourceCardinality).toBe(was.sourceCardinality);
                    expect(back.targetCardinality).toBe(was.targetCardinality);
                }
            }
        }
    });

    it('a diagram file written from a model and read again keeps the direction', () => {
        const file = diagramFile(designOf(USUAL));
        const back = importFileText(file.text, { now: NOW }).design;
        const link = listOf(back.links)[0];
        expect(back.entities.byId[link.sourceEntityId].name).toBe('customers');
        expect(back.entities.byId[link.targetEntityId].name).toBe('orders');
    });
});

// ---------------------------------------------------------------- Part B

const summary = (d: Design) =>
    listOf(d.entities).map((e) => ({
        name: e.name,
        columns: e.columnIds.map((id) => {
            const c = d.columns[id];
            return [c.name, c.type.name, c.nullable, c.primaryKey, c.unique];
        }),
    }));

/**
 * Where the spec's own round trip rule cannot hold, because another rule of
 * the same spec wins. Each entry rewrites the FIRST export into what the
 * second export must be (owner to confirm, see rewrite/phase9/data-checks.md).
 */
const SPEC_ROUND_TRIP_EXCEPTIONS: Record<string, (first: string) => string> = {
    // import-export 10.2 writes comments as `-- text` lines / a block; no
    // reader rule (IMP-033) reads them back for SQL Server and SQLite
    'S2 sql_server': (t) =>
        t
            .replace('/**\nCourse catalogue\n*/\n', '')
            .replace('    -- Display name\n', ''),
    'S2 sqlite': (t) =>
        t
            .replace('-- Course catalogue\n', '')
            .replace('    -- Display name\n', ''),
    // 9.3.2: "anything else: the input unchanged (not upper-cased)" and no
    // length for tinyint, so the boolean spelling TINYINT(1) reads back as tinyint
    'S3 mysql': (t) => t.replace('`active` TINYINT(1)', '`active` tinyint'),
    // 3.6: a single-column unique index sets the column's `unique`, which is
    // then written inline as well (the index line stays)
    'S3 sql_server': (t) =>
        t.replace(
            '[Number] varchar(MAX) NOT NULL,',
            '[Number] varchar(MAX) NOT NULL UNIQUE,'
        ),
    // the "Skipping SQLite system table" note is about a table that only
    // exists in the model, not in the script
    'S3 sqlite': (t) =>
        t.replace('-- Skipping SQLite system table: "sqlite_sequence"\n\n', ''),
};

describe('spec 10 round trip rule: import of a sample script and export again gives the same text', () => {
    const samples = { S1: sampleS1, S2: sampleS2, S3: sampleS3 } as const;
    const types = ['postgresql', 'mysql', 'sql_server', 'sqlite'] as const;
    for (const [label, make] of Object.entries(samples))
        for (const type of types) {
            const key = `${label} ${type}`;
            it(`${key}${key in SPEC_ROUND_TRIP_EXCEPTIONS ? ' (documented exception)' : ''}`, () => {
                const design = make(type);
                const first = exportSql(design, type).text;
                const read = importSql(first, type);
                expect(
                    read.diagnostics.filter((d) => d.severity !== 'info')
                ).toEqual([]);
                const second = exportSql(read.design!, type).text;
                const fix = SPEC_ROUND_TRIP_EXCEPTIONS[key];
                if (fix) {
                    expect(second).not.toBe(first);
                    expect(second).toBe(fix(first));
                } else expect(second).toBe(first);
                // and the tables, fields and flags of the model come back
                expect(
                    summary(read.design!).map((t) => [
                        t.name,
                        t.columns.map((c) => c[0]),
                    ])
                ).toEqual(
                    summary(design)
                        .filter((t) => t.name !== 'sqlite_sequence')
                        .map((t) => [t.name, t.columns.map((c) => c[0])])
                );
            });
        }
});

describe('spec 10.5 import samples', () => {
    it('PostgreSQL A1 gives the listed model and no warning', () => {
        const script = `SET statement_timeout = 0;
CREATE TYPE public.mood AS ENUM ('calm', 'busy');
CREATE TABLE public.pets (
    id integer NOT NULL,
    name character varying(40) NOT NULL,
    mood public.mood DEFAULT 'calm'::public.mood
);
ALTER TABLE ONLY public.pets ADD CONSTRAINT pets_pkey PRIMARY KEY (id);
CREATE TABLE public.vets (id serial PRIMARY KEY, pet_id integer REFERENCES public.pets(id));
CREATE INDEX idx_pets_name ON public.pets USING btree (name);`;
        const r = importSql(script, 'postgresql');
        expect(r.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
        const d = r.design!;
        const types = listOf(d.userTypes);
        expect(types).toHaveLength(1);
        expect(types[0]).toMatchObject({ name: 'mood', schema: 'public' });
        expect(types[0].values).toEqual(['calm', 'busy']);
        expect(listOf(d.entities).map((e) => e.name)).toEqual(['pets', 'vets']);
        const pets = listOf(d.entities)[0];
        const [id, name, mood] = pets.columnIds.map((c) => d.columns[c]);
        expect(pets.schema).toBe('public');
        expect(id).toMatchObject({ primaryKey: true, nullable: false });
        expect(name).toMatchObject({
            type: { name: 'varchar' },
            nullable: false,
        });
        expect(name.length).toBe(40);
        expect(mood).toMatchObject({
            type: { name: 'mood' },
            nullable: true,
            default: "'calm'::public.mood",
        });
        const vets = listOf(d.entities)[1];
        const [vid, petId] = vets.columnIds.map((c) => d.columns[c]);
        expect(vid).toMatchObject({
            type: { name: 'serial' },
            primaryKey: true,
        });
        expect(vid.increment).toBe(true);
        expect(petId).toMatchObject({ nullable: true });
        const link = listOf(d.links)[0];
        expect(d.entities.byId[link.sourceEntityId].name).toBe('pets');
        expect(d.entities.byId[link.targetEntityId].name).toBe('vets');
        expect([link.sourceCardinality, link.targetCardinality]).toEqual([
            'one',
            'many',
        ]);
        const idx = pets.keyIds
            .map((k) => d.keys[k])
            .find((k) => k.label === 'idx_pets_name')!;
        expect(idx).toMatchObject({ distinct: false, algorithm: 'btree' });
        expect(vets.keyIds.some((k) => d.keys[k].pk)).toBe(true);
        expect(pets.keyIds.some((k) => d.keys[k].pk)).toBe(true);
    });

    it('SQLite A1 and SQL Server A1 give the listed relationships', () => {
        const lite = importSql(
            `CREATE TABLE pets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
CREATE TABLE vets (id INTEGER PRIMARY KEY, pet_id INTEGER REFERENCES pets(id) ON DELETE CASCADE);
CREATE UNIQUE INDEX uq_pets_name ON pets(name);`,
            'sqlite'
        );
        expect(lite.diagnostics.filter((x) => x.severity !== 'info')).toEqual(
            []
        );
        const l = listOf(lite.design!.links)[0];
        expect(lite.design!.entities.byId[l.sourceEntityId].name).toBe('pets');
        const ms = importSql(
            `CREATE TABLE [dbo].[Pets] (
    [Id] INT IDENTITY(1,1) NOT NULL,
    [Name] NVARCHAR(40) NOT NULL,
    CONSTRAINT [PK_Pets] PRIMARY KEY CLUSTERED ([Id])
)
GO
CREATE TABLE [dbo].[Vets] ([Id] INT NOT NULL PRIMARY KEY, [PetId] INT NULL)
GO
ALTER TABLE [dbo].[Vets] ADD CONSTRAINT [FK_Vets_Pets] FOREIGN KEY ([PetId]) REFERENCES [dbo].[Pets]([Id])`,
            'sql_server'
        );
        expect(ms.diagnostics.filter((x) => x.severity !== 'info')).toEqual([]);
        const m = listOf(ms.design!.links)[0];
        expect(m.name).toBe('FK_Vets_Pets');
        expect(ms.design!.entities.byId[m.sourceEntityId].name).toBe('Pets');
        expect(ms.design!.entities.byId[m.targetEntityId].name).toBe('Vets');
    });

    it('SQLite CREATE SCHEMA and MySQL inline REFERENCES are blocking errors', () => {
        expect(
            importSql('CREATE SCHEMA x;', 'sqlite').diagnostics.some(
                (d) => d.severity === 'error'
            )
        ).toBe(true);
        const r = importSql(
            'CREATE TABLE a (id INT PRIMARY KEY); CREATE TABLE b (a_id INT REFERENCES a(id));',
            'mysql'
        );
        expect(r.design).toBeUndefined();
        expect(r.diagnostics.find((d) => d.severity === 'error')).toMatchObject(
            { line: 1 }
        );
    });
});

describe('spec 10.5 diagram JSON sample', () => {
    it('export of S1 numbers ids in a running order and imports as 2 tables, 7 fields, 1 index, 1 relationship', () => {
        const file = diagramFile(sampleS1('postgresql'));
        const json = JSON.parse(file.text);
        // spec: "0" customers, "1".."4" its fields, "5" orders, "6".."8" fields,
        // "9" its index, "10" the relationship
        const ids = [
            json.tables[0].id,
            ...json.tables[0].fields.map((f: Row) => f.id),
            ...json.tables[0].indexes.map((i: Row) => i.id),
            json.tables[1].id,
            ...json.tables[1].fields.map((f: Row) => f.id),
            ...json.tables[1].indexes.map((i: Row) => i.id),
            json.relationships[0].id,
        ];
        expect(ids.every((x) => /^\d+$/.test(x))).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
        const back = importFileText(file.text, { now: NOW });
        expect(back.design.entities.order).toHaveLength(2);
        expect(Object.keys(back.design.columns)).toHaveLength(7);
        expect(back.design.links.order).toHaveLength(1);
        // the index of orders (the primary-key entries are separate records)
        const named = Object.values(back.design.keys).filter((k) => !k.pk);
        expect(named).toHaveLength(1);
        expect(back.design.createdAt).toBe(NOW);
    });
});

describe('spec 10.5 DBML sample', () => {
    const DBML = `Table "customers" {
  "id" integer [pk, not null, increment]
  "email" varchar(120) [unique, not null]
  "full_name" varchar(80)
  "created_at" timestamp [not null, default: \`now()\`]
}

Table "orders" {
  "id" integer [pk, not null, increment]
  "customer_id" integer [not null]
  "total" numeric(10,2) [not null, default: 0]

  Indexes {
    customer_id [name: "idx_orders_customer"]
  }
}

Ref "fk_0_fk_orders_customers":"customers"."id" < "orders"."customer_id"`;

    it('exports the exact Ref line and reads back to the S1 model', () => {
        const s1 = sampleS1('postgresql');
        const text = exportDbml(s1).text;
        expect(text.split('\n').filter((l) => l.startsWith('Ref'))).toEqual([
            'Ref "fk_0_fk_orders_customers":"customers"."id" < "orders"."customer_id"',
        ]);
        const read = importDbml(DBML, 'postgresql');
        expect(read.diagnostics).toEqual([]);
        expect(
            summary(read.design!).map((t) => [
                t.name,
                t.columns.map((c) => [c[0], c[3], c[2]]),
            ])
        ).toEqual(
            summary(s1).map((t) => [
                t.name,
                t.columns.map((c) => [c[0], c[3], c[2]]),
            ])
        );
        const link = listOf(read.design!.links)[0];
        expect(read.design!.entities.byId[link.sourceEntityId].name).toBe(
            'customers'
        );
    });

    it('inline form carries the reference on the key column', () => {
        const text = exportDbml(sampleS1('postgresql'), { inline: true }).text;
        expect(text).toContain(
            '"customer_id" integer [not null, ref: > "customers"."id"]'
        );
        expect(text).not.toMatch(/^Ref/m);
    });
});
