import { describe, expect, it } from 'vitest';
import type { Design } from '@/core/model/design';
import { listOf } from '@/core/model/collection';
import { exportSql } from './export-sql';
import { importSql } from './import-sql';

function tables(design: Design) {
    return listOf(design.entities).map((e) => ({
        e,
        cols: e.columnIds.map((id) => design.columns[id]),
        keys: e.keyIds.map((id) => design.keys[id]),
    }));
}
const byName = (d: Design, n: string) => tables(d).find((t) => t.e.name === n)!;

const PG = `SET statement_timeout = 0;
CREATE TYPE public.mood AS ENUM ('calm', 'busy');
CREATE TABLE public.pets (
    id integer NOT NULL,
    name character varying(40) NOT NULL,
    mood public.mood DEFAULT 'calm'::public.mood
);
ALTER TABLE ONLY public.pets ADD CONSTRAINT pets_pkey PRIMARY KEY (id);
CREATE TABLE public.vets (id serial PRIMARY KEY, pet_id integer REFERENCES public.pets(id));
CREATE INDEX idx_pets_name ON public.pets USING btree (name);`;

const MYSQL = `CREATE TABLE \`pets\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`name\` varchar(40) NOT NULL,
  \`kind\` enum('cat','dog') DEFAULT 'cat',
  PRIMARY KEY (\`id\`),
  KEY \`idx_pets_name\` (\`name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE \`vets\` (
  \`id\` int NOT NULL,
  \`pet_id\` int DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`fk_vets_pet\` FOREIGN KEY (\`pet_id\`) REFERENCES \`pets\` (\`id\`)
);`;

const MSSQL = `CREATE TABLE [dbo].[Pets] (
    [Id] INT IDENTITY(1,1) NOT NULL,
    [Name] NVARCHAR(40) NOT NULL,
    CONSTRAINT [PK_Pets] PRIMARY KEY CLUSTERED ([Id])
)
GO
CREATE TABLE [dbo].[Vets] ([Id] INT NOT NULL PRIMARY KEY, [PetId] INT NULL)
GO
ALTER TABLE [dbo].[Vets] ADD CONSTRAINT [FK_Vets_Pets] FOREIGN KEY ([PetId]) REFERENCES [dbo].[Pets]([Id])`;

const SQLITE = `CREATE TABLE pets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
CREATE TABLE vets (id INTEGER PRIMARY KEY, pet_id INTEGER REFERENCES pets(id) ON DELETE CASCADE);
CREATE UNIQUE INDEX uq_pets_name ON pets(name);`;

const quiet = (r: ReturnType<typeof importSql>) =>
    r.diagnostics.filter((d) => d.severity !== 'info');

describe('IMP-018 IMP-020 IMP-021 IMP-025 IMP-027 IMP-029 IMP-030 IMP-034 IMP-036 IMP-041 IMP-042 PostgreSQL import', () => {
    const r = importSql(PG, 'postgresql');
    const d = r.design!;
    it('reads the dump with no warning', () => {
        expect(quiet(r)).toEqual([]);
        expect(d.databaseType).toBe('postgresql');
    });
    it('reads tables, enum, types, flags', () => {
        expect(listOf(d.entities).map((e) => e.name)).toEqual(['pets', 'vets']);
        expect(listOf(d.userTypes)[0]).toMatchObject({
            name: 'mood',
            values: ['calm', 'busy'],
        });
        const pets = byName(d, 'pets');
        expect(pets.cols.map((c) => c.name)).toEqual(['id', 'name', 'mood']);
        expect(pets.cols[0]).toMatchObject({
            primaryKey: true,
            nullable: false,
        });
        expect(pets.cols[1]).toMatchObject({
            type: { name: 'varchar' },
            length: 40,
            nullable: false,
        });
        expect(pets.cols[2]).toMatchObject({
            type: { name: 'mood' },
            nullable: true,
            default: "'calm'::public.mood",
        });
        expect(pets.e.schema).toBe('public');
        const vets = byName(d, 'vets');
        expect(vets.cols[0]).toMatchObject({
            type: { name: 'serial' },
            increment: true,
            primaryKey: true,
        });
        expect(vets.cols[1]).toMatchObject({
            type: { name: 'integer' },
            nullable: true,
        });
    });
    it('reads the foreign key, index and primary key entries', () => {
        const link = listOf(d.links)[0];
        expect(link).toMatchObject({
            sourceCardinality: 'one',
            targetCardinality: 'many',
        });
        expect(d.entities.byId[link.sourceEntityId].name).toBe('pets');
        const pets = byName(d, 'pets');
        expect(pets.keys.map((k) => [k.label, !!k.pk, k.algorithm])).toEqual([
            ['pets_pkey', true, undefined],
            ['idx_pets_name', false, 'btree'],
        ]);
        expect(byName(d, 'vets').keys.filter((k) => k.pk)).toHaveLength(1);
    });
});

describe('IMP-020 IMP-023 IMP-025 IMP-031 MySQL import', () => {
    it('reads the dump', () => {
        const r = importSql(MYSQL, 'mysql');
        expect(quiet(r)).toEqual([]);
        const d = r.design!;
        const pets = byName(d, 'pets');
        expect(pets.cols[0]).toMatchObject({
            type: { name: 'int' },
            increment: true,
            primaryKey: true,
        });
        expect(pets.cols[2]).toMatchObject({
            type: { name: 'enum' },
            nullable: true,
            default: "'cat'",
        });
        expect(pets.keys.find((k) => k.label === 'idx_pets_name')).toBeTruthy();
        const vets = byName(d, 'vets');
        expect(vets.cols[1].default).toBeUndefined();
        expect(listOf(d.links)[0].name).toBe('fk_vets_pet');
    });
    it('IMP-023 inline REFERENCES is a blocking error', () => {
        const r = importSql(
            'CREATE TABLE a (id INT PRIMARY KEY); CREATE TABLE b (a_id INT REFERENCES a(id));',
            'mysql'
        );
        expect(r.design).toBeUndefined();
        expect(
            r.diagnostics.find((x) => x.severity === 'error')?.message
        ).toContain('does not support inline REFERENCES');
    });
});

describe('IMP-032 SQL Server import', () => {
    it('reads GO batches, brackets, IDENTITY and keeps no semicolon warning', () => {
        const r = importSql(MSSQL, 'sql_server');
        expect(quiet(r)).toEqual([]);
        const d = r.design!;
        const pets = byName(d, 'Pets');
        expect(pets.e.schema).toBe('dbo');
        expect(pets.cols[0]).toMatchObject({
            type: { name: 'int' },
            primaryKey: true,
            increment: true,
        });
        expect(pets.cols[1]).toMatchObject({
            type: { name: 'nvarchar' },
            length: 40,
            nullable: false,
        });
        expect(pets.keys.find((k) => k.pk)?.label).toBe('PK_Pets');
        expect(listOf(d.links)[0].name).toBe('FK_Vets_Pets');
        expect(byName(d, 'Vets').cols[1].nullable).toBe(true);
    });
});

describe('IMP-014 IMP-024 SQLite import', () => {
    it('reads the sample', () => {
        const r = importSql(SQLITE, 'sqlite');
        expect(quiet(r)).toEqual([]);
        const d = r.design!;
        expect(byName(d, 'pets').cols[0]).toMatchObject({
            type: { name: 'integer' },
            primaryKey: true,
            nullable: false,
            increment: true,
        });
        expect(byName(d, 'vets').cols[0].increment).toBeUndefined();
        expect(
            byName(d, 'pets').keys.find((k) => k.label === 'uq_pets_name')
        ).toMatchObject({ distinct: true });
        expect(listOf(d.links)).toHaveLength(1);
    });
    it('IMP-014 CREATE SCHEMA is a blocking error', () => {
        const r = importSql('CREATE SCHEMA x;', 'sqlite');
        expect(
            r.diagnostics.some(
                (x) =>
                    x.severity === 'error' &&
                    x.message.includes('CREATE SCHEMA')
            )
        ).toBe(true);
    });
    it('IMP-024 a key to a missing table is dropped with a warning, no table invented', () => {
        const r = importSql(
            'CREATE TABLE a (id INTEGER, b_id INTEGER REFERENCES b(id));',
            'sqlite'
        );
        expect(r.design!.entities.order).toHaveLength(1);
        expect(r.design!.links.order).toHaveLength(0);
        expect(r.diagnostics.some((x) => x.severity === 'warning')).toBe(true);
    });
});

describe('IMP-012 IMP-013 IMP-015 IMP-016 IMP-017 IMP-028 IMP-033 diagnostics', () => {
    it('IMP-012 empty, unterminated and unbalanced text block the import', () => {
        for (const text of [
            '',
            "CREATE TABLE a (x text DEFAULT 'oops);",
            'CREATE TABLE a (x int;',
            'CREATE TABLE a x int);',
        ]) {
            const r = importSql(text, 'postgresql');
            expect(r.design, text).toBeUndefined();
            expect(r.diagnostics.some((x) => x.severity === 'error')).toBe(
                true
            );
        }
    });
    it('IMP-013 broken cast and split decimal are fixable errors', () => {
        const r = importSql(
            'CREATE TABLE a (x numeric(10,\n2), y text DEFAULT 1 : :int);',
            'postgresql'
        );
        expect(r.diagnostics.filter((x) => x.fixable)).toHaveLength(2);
    });
    it('IMP-015 nothing to import is said', () => {
        const r = importSql('DROP TABLE x;', 'postgresql');
        expect(r.design).toBeUndefined();
        expect(r.diagnostics.map((x) => x.message)).toContain(
            'Nothing to import'
        );
    });
    it('IMP-016 PostgreSQL extension and function warnings, IMP-017 other dialects summarise', () => {
        const pg = importSql(
            'CREATE EXTENSION pgcrypto; CREATE TABLE a (id int);',
            'postgresql'
        );
        expect(
            pg.diagnostics.some((x) => x.message.includes('CREATE EXTENSION'))
        ).toBe(true);
        const my = importSql(
            'CREATE TRIGGER t BEFORE INSERT ON a FOR EACH ROW SET x=1; CREATE TABLE a (id int);',
            'mysql'
        );
        expect(
            my.diagnostics.some((x) => x.message.includes('CREATE TRIGGER'))
        ).toBe(true);
    });
    it('IMP-028 views get columns from the select list; select * gives none and a warning', () => {
        const r = importSql(
            'CREATE TABLE t (id int, name text); CREATE VIEW v AS SELECT t.id, name AS n, count(*) FROM t; CREATE VIEW w AS SELECT * FROM t;',
            'postgresql'
        );
        const d = r.design!;
        expect(byName(d, 'v').cols.map((c) => c.name)).toEqual(['id', 'n']);
        expect(byName(d, 'w').cols).toHaveLength(0);
        expect(byName(d, 'v').e.kind).toBe('view');
        expect(listOf(d.entities).map((e) => e.name)).toEqual(['t', 'v', 'w']);
        expect(
            r.diagnostics.some(
                (x) => x.severity === 'warning' && x.message.includes('w')
            )
        ).toBe(true);
    });
    it('IMP-033 COMMENT ON is read', () => {
        const r = importSql(
            "CREATE TABLE a (id int); COMMENT ON TABLE a IS 'T'; COMMENT ON COLUMN a.id IS 'C';",
            'postgresql'
        );
        const a = byName(r.design!, 'a');
        expect(a.e.comments).toBe('T');
        expect(a.cols[0].comments).toBe('C');
    });
});

describe('IMP-019 IMP-026 IMP-035 IMP-037 IMP-038 IMP-039 columns and types', () => {
    it('reads composite keys, unique, check, arrays, max, unknown types', () => {
        const r = importSql(
            `CREATE TABLE a (x int, y int, z text[], w geometry(Point,4326), n numeric(8,3), UNIQUE (x, y), PRIMARY KEY (x, y), CHECK (x > 0));`,
            'postgresql'
        );
        const a = byName(r.design!, 'a');
        expect(a.cols.filter((c) => c.primaryKey).map((c) => c.name)).toEqual([
            'x',
            'y',
        ]);
        expect(a.cols[2]).toMatchObject({
            type: { name: 'text' },
            isArray: true,
        });
        expect(a.cols[3].type.name).toBe('geometry');
        expect(a.cols[4]).toMatchObject({ precision: 8, scale: 3 });
        expect(
            a.keys.some((k) => k.distinct && !k.pk && k.members.length === 2)
        ).toBe(true);
        expect(r.design!.rules[a.e.ruleIds[0]].expression).toBe('x > 0');
        const m = byName(
            importSql(
                'CREATE TABLE b (v int(11) unsigned, t varchar(max));',
                'sql_server'
            ).design!,
            'b'
        );
        expect(m.cols[1].length).toBe('max');
        const my = byName(
            importSql('CREATE TABLE b (v int(11) unsigned);', 'mysql').design!,
            'b'
        );
        expect(my.cols[0].type.name).toBe('int');
    });
});

describe('IMP-043 layout', () => {
    it('no overlaps, finite non-negative coordinates, linked tables closer', () => {
        const sql =
            'CREATE TABLE s1.a (id int primary key); CREATE TABLE s1.b (id int primary key, a_id int references s1.a(id)); CREATE TABLE s2.c (id int primary key); CREATE TABLE s2.d (id int); CREATE TABLE s1.e (id int);';
        const d = importSql(sql, 'postgresql').design!;
        const es = listOf(d.entities);
        for (const e of es) {
            expect(
                Number.isFinite(e.x) &&
                    e.x >= 0 &&
                    Number.isFinite(e.y) &&
                    e.y >= 0
            ).toBe(true);
        }
        for (let i = 0; i < es.length; i++)
            for (let j = i + 1; j < es.length; j++)
                expect(es[i].x === es[j].x && es[i].y === es[j].y).toBe(false);
        const dist = (a: string, b: string) => {
            const p = es.find((e) => e.name === a)!;
            const q = es.find((e) => e.name === b)!;
            return Math.hypot(p.x - q.x, p.y - q.y);
        };
        expect(dist('a', 'b')).toBeLessThan(dist('a', 'c'));
    });
});

describe('EXP-068 round trip', () => {
    it.each([
        ['postgresql', PG.replace('SET statement_timeout = 0;\n', '')],
        ['mysql', MYSQL.replace("enum('cat','dog')", 'varchar(10)')],
        ['sql_server', MSSQL],
        ['sqlite', SQLITE],
    ] as const)(
        '%s: export of the re-import equals the first export',
        (type, script) => {
            const first = importSql(script, type).design!;
            const text1 = exportSql(first, type).text;
            expect(text1.length).toBeGreaterThan(0);
            const second = importSql(text1, type);
            expect(
                second.diagnostics.filter((d) => d.severity === 'error')
            ).toEqual([]);
            expect(exportSql(second.design!, type).text).toBe(text1);
            expect(
                tables(second.design!).map((t) => [
                    t.e.name,
                    t.cols.map((c) => [
                        c.name,
                        c.type.name,
                        c.primaryKey,
                        c.nullable,
                    ]),
                ])
            ).toEqual(
                tables(first).map((t) => [
                    t.e.name,
                    t.cols.map((c) => [
                        c.name,
                        c.type.name,
                        c.primaryKey,
                        c.nullable,
                    ]),
                ])
            );
            expect(second.design!.links.order).toHaveLength(
                first.links.order.length
            );
        }
    );
});
