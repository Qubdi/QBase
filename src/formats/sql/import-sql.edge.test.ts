import { describe, expect, it } from 'vitest';
import type { DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import { listOf } from '@/core/model/collection';
import { exportSql } from './export-sql';
import { importSql } from './import-sql';

const warnings = (r: ReturnType<typeof importSql>) =>
    r.diagnostics.filter((d) => d.severity === 'warning').map((d) => d.message);

/** What a round trip must keep: tables, columns, keys and links, by name. */
function shape(design: Design) {
    const colName = (id: string) => design.columns[id]?.name;
    return {
        tables: listOf(design.entities).map((e) => ({
            schema: e.schema,
            name: e.name,
            kind: e.kind,
            columns: e.columnIds.map((id) => {
                const c = design.columns[id];
                return {
                    name: c.name,
                    type: c.type.name.toLowerCase(),
                    length: c.length,
                    precision: c.precision,
                    scale: c.scale,
                    nullable: c.nullable,
                    primaryKey: c.primaryKey,
                    unique: c.unique,
                };
            }),
            keys: e.keyIds
                .map((id) => design.keys[id])
                .filter((k) => !k.pk)
                .map((k) => ({
                    distinct: k.distinct,
                    members: k.members.map(colName),
                }))
                .sort((a, b) =>
                    JSON.stringify(a).localeCompare(JSON.stringify(b))
                ),
        })),
        links: listOf(design.links)
            .map(
                (l) =>
                    `${colName(l.sourceColumnId)}->${colName(l.targetColumnId)}`
            )
            .sort(),
    };
}

describe('importSql: what cannot be imported', () => {
    it('blocks on an error and reports counts', () => {
        const r = importSql('CREATE TABLE t (id int;', 'postgresql');
        expect(r.design).toBeUndefined();
        expect(r.counts).toEqual({ tables: 0, views: 0, relationships: 0 });
        expect(r.diagnostics.some((d) => d.severity === 'error')).toBe(true);
    });

    it('reports a script without tables as nothing to import', () => {
        const r = importSql('SELECT 1;', 'postgresql');
        expect(r.design).toBeUndefined();
        expect(r.diagnostics.at(-1)).toMatchObject({
            code: 'nothing-to-import',
            severity: 'warning',
        });
    });

    it('reads an unknown database id as PostgreSQL', () => {
        const r = importSql(
            'CREATE TABLE t (id int);',
            'nosuch' as DatabaseType
        );
        expect(r.design?.databaseType).toBe('nosuch');
        expect(r.counts.tables).toBe(1);
    });
});

describe('importSql: tables, keys and indexes', () => {
    it('counts tables, views and relationships', () => {
        const r = importSql(
            `CREATE TABLE p (id int PRIMARY KEY);
CREATE TABLE c (id int PRIMARY KEY, pid int REFERENCES p (id));
CREATE VIEW v AS SELECT id FROM p;`,
            'postgresql'
        );
        expect(r.counts).toEqual({ tables: 2, views: 1, relationships: 1 });
    });

    it('keeps the first of two tables with the same name', () => {
        const r = importSql(
            'CREATE TABLE t (a int); CREATE TABLE t (b int);',
            'postgresql'
        );
        expect(warnings(r)).toContain(
            'Table t is defined twice: the second definition was ignored.'
        );
        expect(shape(r.design!).tables).toHaveLength(1);
    });

    it('keeps tables of the same name in different schemas apart', () => {
        const r = importSql(
            'CREATE TABLE a.t (x int); CREATE TABLE b.t (y int);',
            'postgresql'
        );
        expect(
            shape(r.design!).tables.map((t) => `${t.schema}.${t.name}`)
        ).toEqual(['a.t', 'b.t']);
    });

    it('marks a single-column unique key and makes a composite one an index', () => {
        const r = importSql(
            'CREATE TABLE t (a int, b int, c int, UNIQUE (a), CONSTRAINT uq_bc UNIQUE (b, c), UNIQUE (nope));',
            'postgresql'
        );
        const t = shape(r.design!).tables[0];
        expect(t.columns.map((c) => c.unique)).toEqual([true, false, false]);
        expect(t.keys).toContainEqual({ distinct: true, members: ['b', 'c'] });
    });

    it('marks a column unique from a unique index, but not from a partial one', () => {
        const r = importSql(
            `CREATE TABLE t (a int, b int, c int);
CREATE UNIQUE INDEX u1 ON t (a);
CREATE UNIQUE INDEX u2 ON t (b) WHERE b > 0;
CREATE UNIQUE INDEX u3 ON t (nope);`,
            'postgresql'
        );
        const t = shape(r.design!).tables[0];
        expect(t.columns.map((c) => c.unique)).toEqual([true, false, false]);
    });

    it('reports an index on a missing table and on an ambiguous one', () => {
        const r = importSql(
            `CREATE TABLE a.t (x int);
CREATE TABLE b.t (x int);
CREATE INDEX i1 ON ghost (x);
CREATE INDEX i2 ON t (x);`,
            'postgresql'
        );
        expect(warnings(r)).toContain(
            'Index i1 ignored: table ghost is not in the script.'
        );
        expect(warnings(r)).toContain(
            'Index i2 names t without a schema and several schemas have it: the first was used.'
        );
    });
});

describe('importSql: foreign keys', () => {
    it('drops a foreign key to a missing table', () => {
        const r = importSql(
            'CREATE TABLE c (pid int, FOREIGN KEY (pid) REFERENCES ghost (id));',
            'postgresql'
        );
        expect(warnings(r)).toContain(
            'Foreign key on c dropped: table ghost is not in the script.'
        );
        expect(r.counts.relationships).toBe(0);
    });

    it('drops a foreign key whose column counts do not match', () => {
        const r = importSql(
            `CREATE TABLE p (a int, b int, PRIMARY KEY (a, b));
CREATE TABLE c (x int, FOREIGN KEY (x) REFERENCES p);`,
            'postgresql'
        );
        expect(warnings(r)).toContain(
            'Foreign key on c dropped: its columns do not match.'
        );
    });

    it('drops a foreign key to a missing column', () => {
        const r = importSql(
            `CREATE TABLE p (id int PRIMARY KEY);
CREATE TABLE c (pid int, CONSTRAINT fk FOREIGN KEY (pid) REFERENCES p (nope));`,
            'postgresql'
        );
        expect(warnings(r)).toContain(
            'Foreign key fk dropped: a table or column is missing.'
        );
    });

    it('links a composite foreign key column by column, to the primary key when unnamed', () => {
        const r = importSql(
            `CREATE TABLE p (a int, b int, PRIMARY KEY (a, b));
CREATE TABLE c (x int, y int, FOREIGN KEY (x, y) REFERENCES p);`,
            'postgresql'
        );
        expect(shape(r.design!).links).toEqual(['a->x', 'b->y']);
        expect(r.counts.relationships).toBe(2);
    });

    it('prefers the holding table schema for an unqualified target', () => {
        const r = importSql(
            `CREATE TABLE a.p (id int PRIMARY KEY);
CREATE TABLE b.p (id int PRIMARY KEY);
CREATE TABLE b.c (pid int REFERENCES p (id));`,
            'postgresql'
        );
        const d = r.design!;
        const link = listOf(d.links)[0];
        const source = listOf(d.entities).find((e) =>
            e.columnIds.includes(link.sourceColumnId)
        );
        expect(source?.schema).toBe('b');
    });
});

const ROUND_TRIP: Record<string, { id: DatabaseType; sql: string }> = {
    postgresql: {
        id: 'postgresql',
        sql: `CREATE TABLE public.parent (
    id integer NOT NULL,
    code character varying(20) NOT NULL,
    price numeric(10, 2) DEFAULT 0,
    "Ünï Name" text,
    CONSTRAINT parent_pkey PRIMARY KEY (id, code)
);
CREATE TABLE public.child (
    id bigint PRIMARY KEY,
    pid integer,
    pcode varchar(20),
    note text DEFAULT 'it''s',
    CONSTRAINT fk_child FOREIGN KEY (pid, pcode) REFERENCES public.parent (id, code)
);
CREATE UNIQUE INDEX child_pid_note ON public.child (pid, note);`,
    },
    mysql: {
        id: 'mysql',
        sql: `CREATE TABLE \`parent\` (
  \`id\` int NOT NULL,
  \`code\` varchar(20) NOT NULL,
  \`price\` decimal(10,2) DEFAULT '0.00',
  PRIMARY KEY (\`id\`, \`code\`)
);
CREATE TABLE \`child\` (
  \`id\` bigint NOT NULL AUTO_INCREMENT,
  \`pid\` int,
  \`pcode\` varchar(20),
  \`note\` varchar(100) DEFAULT 'it''s',
  PRIMARY KEY (\`id\`),
  KEY \`ix_note\` (\`note\`),
  CONSTRAINT \`fk_child\` FOREIGN KEY (\`pid\`, \`pcode\`) REFERENCES \`parent\` (\`id\`, \`code\`)
);`,
    },
    sql_server: {
        id: 'sql_server',
        sql: `CREATE TABLE [dbo].[parent] (
    [id] INT NOT NULL,
    [code] NVARCHAR(20) NOT NULL,
    [price] DECIMAL(10, 2) DEFAULT ((0)),
    CONSTRAINT [pk_parent] PRIMARY KEY CLUSTERED ([id], [code])
)
GO
CREATE TABLE [dbo].[child] (
    [id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [pid] INT NULL,
    [pcode] NVARCHAR(20) NULL,
    [note] NVARCHAR(100) DEFAULT (N'it''s')
)
GO
ALTER TABLE [dbo].[child] ADD CONSTRAINT [fk_child] FOREIGN KEY ([pid], [pcode]) REFERENCES [dbo].[parent] ([id], [code])
GO`,
    },
    sqlite: {
        id: 'sqlite',
        sql: `CREATE TABLE parent (
    id INTEGER NOT NULL,
    code TEXT NOT NULL,
    price REAL DEFAULT 0,
    PRIMARY KEY (id, code)
);
CREATE TABLE child (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pid INTEGER,
    pcode TEXT,
    note TEXT DEFAULT 'it''s',
    FOREIGN KEY (pid, pcode) REFERENCES parent (id, code)
);`,
    },
    oracle: {
        id: 'oracle',
        sql: `CREATE TABLE "PARENT" (
    "ID" NUMBER(10) NOT NULL,
    "CODE" VARCHAR2(20 CHAR) NOT NULL,
    "PRICE" NUMBER(10, 2) DEFAULT 0,
    CONSTRAINT "PK_PARENT" PRIMARY KEY ("ID", "CODE")
);
CREATE TABLE "CHILD" (
    "ID" NUMBER(19) GENERATED BY DEFAULT AS IDENTITY,
    "PID" NUMBER(10),
    "PCODE" VARCHAR2(20 CHAR),
    "NOTE" VARCHAR2(100 CHAR) DEFAULT 'it''s',
    CONSTRAINT "PK_CHILD" PRIMARY KEY ("ID"),
    CONSTRAINT "FK_CHILD" FOREIGN KEY ("PID", "PCODE") REFERENCES "PARENT" ("ID", "CODE")
);`,
    },
};

describe('importSql: read, write, read again keeps the design', () => {
    for (const [label, { id, sql }] of Object.entries(ROUND_TRIP))
        it(label, () => {
            const first = importSql(sql, id);
            expect(
                first.diagnostics.filter((d) => d.severity === 'error')
            ).toEqual([]);
            expect(first.design).toBeDefined();
            expect(first.counts.relationships).toBe(2);

            const written = exportSql(first.design!, id);
            expect(
                written.diagnostics.filter((d) => d.severity === 'error')
            ).toEqual([]);

            const second = importSql(written.text, id);
            expect(
                second.diagnostics.filter((d) => d.severity === 'error')
            ).toEqual([]);
            expect(shape(second.design!)).toEqual(shape(first.design!));

            // and a second round is stable as text
            const again = exportSql(second.design!, id);
            expect(again.text).toBe(written.text);
        });
});

describe('importSql: round-trip losses', () => {
    it('CLI-129: exports a MySQL default holding a backslash-escaped quote', () => {
        const first = importSql(
            "CREATE TABLE t (id int PRIMARY KEY, note varchar(9) DEFAULT 'it\\'s');",
            'mysql'
        );
        expect(first.design).toBeDefined();
        const written = exportSql(first.design!, 'mysql');
        expect(
            written.diagnostics.filter((d) => d.severity === 'error')
        ).toEqual([]);
    });

    it('CLI-130: keeps a named single-column unique index through a round trip', () => {
        const first = importSql(
            'CREATE TABLE t (id int PRIMARY KEY, note text); CREATE UNIQUE INDEX t_note ON t (note);',
            'postgresql'
        );
        const second = importSql(
            exportSql(first.design!, 'postgresql').text,
            'postgresql'
        );
        expect(shape(second.design!)).toEqual(shape(first.design!));
    });
});
