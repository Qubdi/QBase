import { describe, expect, it } from 'vitest';
import { readMysql } from '../mysql/read';
import { readOracle } from '../oracle/read';
import { readPostgres } from '../postgresql/read';
import type { ScriptResult } from '../script-model';
import { readSqlServer } from '../sql-server/read';
import { readSqlite } from '../sqlite/read';

const table = (r: ScriptResult, name: string) => {
    const t = r.tables.find((x) => x.name === name);
    if (!t)
        throw new Error(
            `no table ${name} in ${r.tables.map((x) => x.name).join(', ')}`
        );
    return t;
};
const col = (r: ScriptResult, t: string, c: string) => {
    const found = table(r, t).columns.find((x) => x.name === c);
    if (!found) throw new Error(`no column ${t}.${c}`);
    return found;
};
const messages = (r: ScriptResult) => r.diagnostics.map((d) => d.message);
const errors = (r: ScriptResult) =>
    r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);

describe('readers: empty and malformed input never throw', () => {
    const readers = {
        postgres: readPostgres,
        mysql: readMysql,
        sqlserver: readSqlServer,
        sqlite: readSqlite,
        oracle: readOracle,
    };
    const inputs = [
        '',
        '   \n\t',
        ';;;',
        'CREATE',
        'CREATE TABLE',
        'CREATE TABLE (',
        'CREATE TABLE t (',
        'CREATE TABLE t ())',
        'ALTER TABLE',
        'ALTER TABLE t ADD',
        'CREATE INDEX',
        'CREATE INDEX i ON',
        'CREATE VIEW',
        'CREATE VIEW v AS',
        'COMMENT ON TABLE',
        '/* unterminated CREATE TABLE t (id int);',
        "CREATE TABLE t (s text DEFAULT 'open);",
        'CREATE TABLE "t (id int);',
        'select 1; drop table x; insert into y values (1);',
        '\u0000￿ CREATE TABLE \u{1F600} (x int);',
    ];
    for (const [name, read] of Object.entries(readers))
        for (const input of inputs)
            it(`${name}: ${JSON.stringify(input)}`, () => {
                expect(() => read(input)).not.toThrow();
            });

    it('reports an empty script as an error for every dialect', () => {
        for (const read of Object.values(readers))
            expect(errors(read(''))).toEqual(['SQL script is empty']);
    });

    it('reports text with no SQL statement', () => {
        expect(errors(readPostgres('hello world;'))).toContain(
            'No valid SQL statements found'
        );
    });

    it('reports unclosed and unmatched parentheses and reads nothing', () => {
        const open = readPostgres('CREATE TABLE t (id int;');
        expect(errors(open)).toContain('Unclosed parenthesis');
        expect(open.tables).toEqual([]);
        expect(errors(readPostgres('CREATE TABLE t (id int));'))).toContain(
            'Unmatched closing parenthesis'
        );
    });

    it('reports an unterminated block comment and string', () => {
        expect(
            errors(readPostgres('CREATE TABLE t (id int); /* open'))
        ).toEqual(['Unterminated block comment']);
        expect(
            errors(readMysql("CREATE TABLE t (a text DEFAULT 'x);"))
        ).toContain('Unterminated quoted text');
    });
});

describe('readers: comments and quoting', () => {
    it('ignores -- and /* */ comments between and inside statements', () => {
        const r = readPostgres(`-- head
/* block
   CREATE TABLE ghost (x int); */
CREATE TABLE t ( -- the key
    id int, /* inline */ name text -- trailing
);`);
        expect(r.tables.map((t) => t.name)).toEqual(['t']);
        expect(table(r, 't').columns.map((c) => c.name)).toEqual([
            'id',
            'name',
        ]);
    });

    it('reads # comments in MySQL', () => {
        const r = readMysql('# note\nCREATE TABLE t (id int); # tail\n');
        expect(r.tables.map((t) => t.name)).toEqual(['t']);
    });

    it('does not split a statement at a ; inside a string or comment', () => {
        const r = readPostgres(
            "CREATE TABLE t (a text DEFAULT 'x;y', b int /* ; */);"
        );
        expect(col(r, 't', 'a').default).toBe("'x;y'");
        expect(col(r, 't', 'b')).toBeDefined();
    });

    it('reads quoted names with escapes, spaces and unicode in every dialect', () => {
        const pg = readPostgres(
            'CREATE TABLE "My ""T""" ("名前" text, "ünï code" int);'
        );
        expect(table(pg, 'My "T"').columns.map((c) => c.name)).toEqual([
            '名前',
            'ünï code',
        ]);
        const my = readMysql('CREATE TABLE `a``b` (`c d` int);');
        expect(col(my, 'a`b', 'c d').typeName).toBe('int');
        const ms = readSqlServer('CREATE TABLE [x]]y] ([c d] int)');
        expect(col(ms, 'x]y', 'c d').typeName).toBe('int');
        const lite = readSqlite('CREATE TABLE [a] ("b" int, `c` text);');
        expect(table(lite, 'a').columns.map((c) => c.name)).toEqual(['b', 'c']);
        const ora = readOracle('CREATE TABLE "S"."T" ("Id" NUMBER(10));');
        expect(table(ora, 'T').schema).toBe('S');
        expect(col(ora, 'T', 'Id').precision).toBe(10);
    });

    it('reads unquoted unicode names', () => {
        const r = readPostgres('CREATE TABLE ünï (идентификатор int);');
        expect(col(r, 'ünï', 'идентификатор').typeName).toBe('int');
    });

    it('reads a string with a doubled quote in a default', () => {
        const r = readOracle("CREATE TABLE t (s VARCHAR2(9) DEFAULT 'it''s');");
        expect(col(r, 't', 's').default).toBe("'it''s'");
    });

    it('reads a backslash-escaped quote in a MySQL default as a doubled quote', () => {
        const r = readMysql("CREATE TABLE t (s varchar(9) DEFAULT 'it\\'s');");
        expect(col(r, 't', 's').default).toBe("'it''s'");
    });

    it('CLI-122: accepts a PostgreSQL E-string with an escaped quote', () => {
        const r = readPostgres(
            "CREATE TABLE t (s text DEFAULT E'it\\'s', id int);"
        );
        expect(errors(r)).toEqual([]);
        expect(table(r, 't').columns).toHaveLength(2);
    });

    it('CLI-123: accepts a MySQL double-quoted string holding an apostrophe', () => {
        const r = readMysql('CREATE TABLE t (id int COMMENT "it\'s");');
        expect(errors(r)).toEqual([]);
        expect(col(r, 't', 'id').comment).toBe("it's");
    });

    // BUG: PostgreSQL nests block comments. The lexer and the validator close
    // the comment at the first */, so the rest of the comment becomes code in
    // front of CREATE TABLE and the table is silently dropped (the validator
    // still says "Found 1 table to import").
    it.fails('reads a table after a nested block comment', () => {
        const r = readPostgres(
            '/* a /* nested */ still comment */ CREATE TABLE t (id int);'
        );
        expect(r.tables.map((t) => t.name)).toEqual(['t']);
    });

    it('CLI-125: reports an unterminated [name] in SQL Server as an error', () => {
        const r = readSqlServer('CREATE TABLE [foo (id int)');
        expect(errors(r)).toContain('Unterminated quoted text');
    });

    it('CLI-124: accepts a SQL Server name holding ]] and a parenthesis', () => {
        const r = readSqlServer('CREATE TABLE [a]]( b] (id int)');
        expect(errors(r)).toEqual([]);
        expect(r.tables.map((t) => t.name)).toEqual(['a]( b']);
    });
});

describe('readers: multi-statement scripts and GO batches', () => {
    it('splits SQL Server batches at GO lines, any case, without semicolons', () => {
        const r = readSqlServer(`CREATE TABLE dbo.a (id int)
go
CREATE TABLE [dbo].[b] ([id] int, CONSTRAINT [pk_b] PRIMARY KEY CLUSTERED ([id] ASC))
GO
`);
        expect(r.tables.map((t) => `${t.schema}.${t.name}`)).toEqual([
            'dbo.a',
            'dbo.b',
        ]);
        expect(table(r, 'b').primaryKey).toEqual({
            name: 'pk_b',
            columns: ['id'],
        });
    });

    it('keeps a column called go inside parentheses', () => {
        const r = readSqlServer('CREATE TABLE t (\ngo int\n)\nGO');
        expect(col(r, 't', 'go').typeName).toBe('int');
    });

    it('CLI-120: splits at GO followed by a repeat count', () => {
        const r = readSqlServer(
            'CREATE TABLE a (id int)\nGO 2\nCREATE TABLE b (id int)\nGO'
        );
        expect(r.tables.map((t) => t.name)).toEqual(['a', 'b']);
    });

    it('ignores statements that define no data', () => {
        const r = readPostgres(`SET search_path = public;
SELECT 1;
INSERT INTO t VALUES (1);
CREATE TABLE t (id int);
DROP TABLE IF EXISTS z;`);
        expect(r.tables.map((t) => t.name)).toEqual(['t']);
    });

    it('skips COPY data rows in a PostgreSQL dump', () => {
        const r = readPostgres(`CREATE TABLE t (id int, s text);
COPY public.t (id, s) FROM stdin;
1\tx; CREATE TABLE fake (x int);
\\.
CREATE TABLE u (id int);`);
        expect(r.tables.map((t) => t.name)).toEqual(['t', 'u']);
    });

    // BUG: readStatements blanks COPY ... FROM stdin rows (blankCopyData), but
    // makeReader validates the raw text first, so an apostrophe in a data row
    // (O'Brien) is "Unterminated quoted text" and the whole pg_dump is refused.
    it.fails('accepts COPY data rows holding an apostrophe', () => {
        const r = readPostgres(`CREATE TABLE t (id int, s text);
COPY public.t (id, s) FROM stdin;
1\tO'Brien
\\.
CREATE TABLE u (id int);`);
        expect(errors(r)).toEqual([]);
        expect(r.tables.map((t) => t.name)).toEqual(['t', 'u']);
    });

    it('skips a dollar-quoted function body, semicolons and all', () => {
        const r = readPostgres(`CREATE FUNCTION f() RETURNS int AS $body$
BEGIN; CREATE TABLE fake (x int); RETURN 1; END;
$body$ LANGUAGE plpgsql;
CREATE TABLE real (id int);`);
        expect(r.tables.map((t) => t.name)).toEqual(['real']);
    });

    it('CLI-121: skips a function body quoted with a $q1$ tag', () => {
        const r =
            readPostgres(`CREATE FUNCTION f() RETURNS int AS $q1$ SELECT 1; CREATE TABLE fake (x int); $q1$ LANGUAGE sql;
CREATE TABLE real (id int);`);
        expect(r.tables.map((t) => t.name)).toEqual(['real']);
    });

    it('counts skipped statement kinds once, with a plural', () => {
        const r = readMysql(`CREATE TABLE t (id int);
CREATE PROCEDURE p() BEGIN SELECT 1; END;
CREATE PROCEDURE q() BEGIN SELECT 2; END;
CREATE SEQUENCE s;`);
        expect(messages(r)).toContain(
            '2 CREATE PROCEDURE statements skipped: not imported.'
        );
        expect(messages(r)).toContain(
            '1 CREATE SEQUENCE statement skipped: not imported.'
        );
    });

    it('leaves skips the PostgreSQL validator already reports to it', () => {
        const r = readPostgres(`CREATE EXTENSION x;
CREATE POLICY p ON t USING (true);
CREATE TABLE t (id int);`);
        expect(messages(r)).not.toContain(
            '1 CREATE EXTENSION statement skipped: not imported.'
        );
        expect(messages(r)).toContain(
            '1 CREATE POLICY statement skipped: not imported.'
        );
    });
});

describe('CREATE TABLE variants', () => {
    it('skips temporary tables and CREATE TABLE AS', () => {
        const r = readPostgres(`CREATE TEMP TABLE a (id int);
CREATE TEMPORARY TABLE b (id int);
CREATE TABLE c AS SELECT 1;
CREATE TABLE d (id int);`);
        expect(r.tables.map((t) => t.name)).toEqual(['d']);
        expect(messages(r)).toContain(
            '2 CREATE TEMPORARY TABLE statements skipped: not imported.'
        );
        expect(messages(r)).toContain(
            '1 CREATE TABLE ... AS, LIKE or PARTITION OF statement skipped: not imported.'
        );
    });

    it('reads IF NOT EXISTS, OR REPLACE, UNLOGGED and schemas', () => {
        const r = readPostgres(
            `CREATE UNLOGGED TABLE IF NOT EXISTS s.t (id int);`
        );
        expect(table(r, 't').schema).toBe('s');
    });

    it('reports a column defined twice and keeps the first', () => {
        const r = readPostgres('CREATE TABLE t (a int, a text);');
        expect(col(r, 't', 'a').typeName).toBe('int');
        expect(messages(r)).toContain(
            'Column a is defined twice in table t: the second definition was ignored.'
        );
    });

    it('ignores an empty element and a non-column element', () => {
        const r = readSqlite('CREATE TABLE t (a int,, (b), c int);');
        expect(table(r, 't').columns.map((c) => c.name)).toEqual(['a', 'c']);
    });

    it('reports a constraint it cannot read', () => {
        const r = readPostgres(`CREATE TABLE t (
  a int,
  EXCLUDE USING gist (a WITH =),
  FOREIGN KEY (a)
);`);
        const ignored = messages(r).filter((m) =>
            m.startsWith('A constraint of table t was ignored')
        );
        expect(ignored).toEqual([
            'A constraint of table t was ignored: EXCLUDE USING gist ...',
            'A constraint of table t was ignored: FOREIGN KEY (a) ...',
        ]);
    });

    it('reads composite primary, unique and foreign keys', () => {
        const r =
            readPostgres(`CREATE TABLE p (a int, b int, CONSTRAINT pk_p PRIMARY KEY (a, b));
CREATE TABLE c (
  x int, y int,
  CONSTRAINT uq_c UNIQUE (x, y),
  CONSTRAINT fk_c FOREIGN KEY (x, y) REFERENCES p (a, b) ON DELETE CASCADE ON UPDATE SET NULL
);`);
        expect(table(r, 'p').primaryKey).toEqual({
            name: 'pk_p',
            columns: ['a', 'b'],
        });
        expect(col(r, 'p', 'a').nullable).toBe(false);
        expect(table(r, 'c').uniqueKeys).toEqual([
            { name: 'uq_c', columns: ['x', 'y'] },
        ]);
        expect(r.foreignKeys).toEqual([
            expect.objectContaining({
                name: 'fk_c',
                columns: ['x', 'y'],
                refTable: { name: 'p' },
                refColumns: ['a', 'b'],
            }),
        ]);
    });

    it('builds a composite key from several inline PRIMARY KEY columns', () => {
        const r = readSqlite(
            'CREATE TABLE t (a int PRIMARY KEY, b int PRIMARY KEY);'
        );
        expect(table(r, 't').primaryKey).toEqual({ columns: ['a', 'b'] });
    });

    it('reads MySQL KEY, INDEX, FULLTEXT and SPATIAL entries as indexes', () => {
        const r = readMysql(`CREATE TABLE t (
  id int,
  name varchar(20),
  body text,
  geo geometry,
  \`key\` varchar(10),
  \`index\` int,
  KEY idx_name (name DESC),
  INDEX (id),
  KEY k_hash USING HASH (id),
  FULLTEXT KEY ft_body (body),
  SPATIAL INDEX sp_geo (geo),
  UNIQUE KEY uq_name (name),
  FOREIGN KEY fk_named (id) REFERENCES t (id)
) ENGINE=InnoDB COMMENT = 'the table';`);
        expect(table(r, 't').columns.map((c) => c.name)).toEqual([
            'id',
            'name',
            'body',
            'geo',
            'key',
            'index',
        ]);
        expect(
            r.indexes.map((i) => [i.name, i.columns, i.descending, i.method])
        ).toEqual([
            ['idx_name', ['name'], ['name'], undefined],
            ['t_id_idx', ['id'], undefined, undefined],
            ['k_hash', ['id'], undefined, 'hash'],
            ['ft_body', ['body'], undefined, 'fulltext'],
            ['sp_geo', ['geo'], undefined, 'spatial'],
        ]);
        expect(table(r, 't').uniqueKeys).toEqual([
            { name: 'uq_name', columns: ['name'] },
        ]);
        expect(r.foreignKeys[0].name).toBe('fk_named');
        expect(table(r, 't').comment).toBe('the table');
    });

    it('CLI-126: reads CONSTRAINT c FOREIGN KEY idx (...) and CONSTRAINT c UNIQUE KEY idx (...)', () => {
        const r = readMysql(`CREATE TABLE t (
  id int,
  CONSTRAINT uq UNIQUE KEY uq_idx (id),
  CONSTRAINT fk FOREIGN KEY fk_idx (id) REFERENCES t (id)
);`);
        expect(table(r, 't').uniqueKeys).toEqual([
            { name: 'uq', columns: ['id'] },
        ]);
        expect(r.foreignKeys.map((f) => [f.name, f.columns])).toEqual([
            ['fk', ['id']],
        ]);
    });

    it('CLI-126: reads the columns of CONSTRAINT c KEY idx (...), named by the constraint', () => {
        const r = readMysql(`CREATE TABLE t (
  id int,
  CONSTRAINT c KEY idx (id)
);`);
        expect(r.indexes.map((i) => [i.name, i.columns])).toEqual([
            ['c', ['id']],
        ]);
    });

    it('reads a table comment without =', () => {
        const r = readMysql("CREATE TABLE t (id int) COMMENT 'hi';");
        expect(table(r, 't').comment).toBe('hi');
    });

    it('tells KEY/INDEX/LIKE/PERIOD column names from their constraints', () => {
        const r = readPostgres(`CREATE TABLE t (
  key varchar(10),
  index int,
  "like" text,
  like text,
  period int,
  exclude int,
  fulltext int,
  spatial int
);`);
        expect(table(r, 't').columns.map((c) => c.name)).toEqual([
            'key',
            'index',
            'like',
            'period',
            'exclude',
            'fulltext',
            'spatial',
        ]);
    });

    it('treats LIKE other_table and PERIOD FOR as constraints it ignores', () => {
        const r = readPostgres(`CREATE TABLE t (
  a int,
  LIKE base INCLUDING ALL,
  PERIOD FOR p (a, a)
);`);
        expect(table(r, 't').columns.map((c) => c.name)).toEqual(['a']);
        expect(
            messages(r).filter((m) => m.includes('was ignored'))
        ).toHaveLength(2);
    });
});

describe('column definitions', () => {
    it('reads multi-word, qualified, array and argument types', () => {
        const r = readPostgres(`CREATE TABLE t (
  a double precision,
  b timestamp(3) with time zone,
  c character varying(40),
  d public.mood,
  e int[],
  f int[3][3],
  g text[] ARRAY,
  h numeric(10, 2),
  i numeric(5, -2),
  j "MyType",
  k bit varying(8),
  l char
);`);
        const t = (c: string) => col(r, 't', c);
        expect(t('a').typeName).toBe('double precision');
        expect(t('b').typeName).toBe('timestamptz');
        expect([t('c').typeName, t('c').length]).toEqual(['varchar', 40]);
        expect(t('d').typeName).toBe('mood');
        expect([t('e').isArray, t('f').isArray, t('g').isArray]).toEqual([
            true,
            true,
            true,
        ]);
        expect([t('h').precision, t('h').scale]).toEqual([10, 2]);
        expect([t('i').precision, t('i').scale]).toEqual([5, -2]);
        expect(t('g').typeName).toBe('text');
        expect(t('j').typeName).toBe('MyType');
        expect(t('k').typeName).toBe('varbit');
        expect(t('l').typeName).toBe('char');
    });

    it('CLI-127: reads the SQL-standard `type ARRAY` spelling as an array', () => {
        const r = readPostgres('CREATE TABLE t (g text ARRAY);');
        expect(col(r, 't', 'g')).toMatchObject({
            typeName: 'text',
            isArray: true,
        });
    });

    it('drops unsigned and zerofill and stops a type at CHARACTER SET', () => {
        const r = readMysql(
            'CREATE TABLE t (a int unsigned zerofill NOT NULL, b text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin, c varchar(5) CHARSET latin1);'
        );
        expect(col(r, 't', 'a')).toMatchObject({
            typeName: 'int',
            nullable: false,
        });
        expect(col(r, 't', 'b').typeName).toBe('text');
        expect(col(r, 't', 'c').length).toBe(5);
    });

    it('reads varchar(max), Oracle CHAR/BYTE lengths and an odd length', () => {
        const ms = readSqlServer(
            'CREATE TABLE t (a nvarchar(max), b varchar(MAX))'
        );
        expect(col(ms, 't', 'a').length).toBe('max');
        expect(col(ms, 't', 'b').length).toBe('max');
        const ora = readOracle(
            'CREATE TABLE t (a VARCHAR2(50 CHAR), b VARCHAR2(20 BYTE), c NUMBER(*, 2));'
        );
        expect(col(ora, 't', 'a').length).toBe(50);
        expect(col(ora, 't', 'b').length).toBe(20);
        expect(col(ora, 't', 'c').precision).toBeUndefined();
        expect(col(ora, 't', 'c').scale).toBe(2);
    });

    it('stops reading a type after five words', () => {
        const r = readPostgres(
            'CREATE TABLE t (a one two three four five six);'
        );
        expect(col(r, 't', 'a').typeName).toBe('one two three four five');
    });

    it('reads defaults with parentheses, casts, operators and signs', () => {
        const r = readPostgres(`CREATE TABLE t (
  a int DEFAULT -1,
  b int DEFAULT (1 + 2) * 3,
  c text DEFAULT 'a' || 'b',
  d text DEFAULT 'x'::character varying(10),
  e text[] DEFAULT '{}'::text[],
  f timestamptz DEFAULT now(),
  g text DEFAULT NULL,
  h numeric DEFAULT +1.5,
  i date DEFAULT CURRENT_DATE NOT NULL,
  j text DEFAULT E'x',
  k int DEFAULT nextval('t_k_seq'::regclass),
  l mood DEFAULT 'calm'::public.mood
);`);
        const d = (c: string) => col(r, 't', c).default;
        expect(d('a')).toBe('-1');
        expect(d('b')).toBe('(1 + 2) * 3');
        expect(d('c')).toBe("'a' || 'b'");
        expect(d('d')).toBe("'x'::character varying(10)");
        expect(d('e')).toBe("'{}'::text[]");
        expect(d('f')).toBe('now()');
        expect(d('g')).toBeUndefined();
        expect(d('h')).toBe('+1.5');
        expect(d('i')).toBe('CURRENT_DATE');
        expect(col(r, 't', 'i').nullable).toBe(false);
        expect(d('j')).toBe("E'x'");
        expect(col(r, 't', 'k').numbered).toBe(true);
        expect(d('l')).toBe("'calm'::public.mood");
    });

    it('reads SQL Server defaults wrapped in parentheses and NEXT VALUE FOR', () => {
        const r = readSqlServer(`CREATE TABLE t (
  d datetime DEFAULT (getdate()),
  n nvarchar(10) DEFAULT (N'x'),
  s varchar(10) DEFAULT ('a''b'),
  q int DEFAULT NEXT VALUE FOR dbo.seq,
  z int CONSTRAINT df_z DEFAULT ((0)) NOT NULL
)`);
        const d = (c: string) => col(r, 't', c).default;
        expect(d('d')).toBe('(getdate())');
        expect(d('n')).toBe("(N'x')");
        expect(d('s')).toBe("('a''b')");
        expect(d('q')).toBe('NEXT VALUE FOR dbo.seq');
        expect(d('z')).toBe('((0))');
        expect(col(r, 't', 'z').nullable).toBe(false);
    });

    it('takes no default when DEFAULT ends the column', () => {
        const r = readSqlite('CREATE TABLE t (a int DEFAULT);');
        expect(col(r, 't', 'a').default).toBeUndefined();
    });

    it('reads numbering in every spelling', () => {
        const my = readMysql(
            'CREATE TABLE t (id int AUTO_INCREMENT PRIMARY KEY);'
        );
        expect(col(my, 't', 'id').numbered).toBe(true);
        const lite = readSqlite(
            'CREATE TABLE t (id integer PRIMARY KEY AUTOINCREMENT);'
        );
        expect(col(lite, 't', 'id')).toMatchObject({
            numbered: true,
            nullable: false,
            primary: true,
        });
        const ms = readSqlServer(
            'CREATE TABLE t (id int IDENTITY(1,1) NOT NULL)'
        );
        expect(col(ms, 't', 'id').numbered).toBe(true);
        const pg = readPostgres(
            'CREATE TABLE t (a int GENERATED ALWAYS AS IDENTITY, b bigint GENERATED BY DEFAULT AS IDENTITY (START WITH 10), c bigserial);'
        );
        expect(['a', 'b', 'c'].map((c) => col(pg, 't', c).numbered)).toEqual([
            true,
            true,
            true,
        ]);
        const ora = readOracle(
            'CREATE TABLE t (id NUMBER GENERATED BY DEFAULT ON NULL AS IDENTITY);'
        );
        expect(col(ora, 't', 'id').numbered).toBe(true);
    });

    it('reads computed columns in every spelling', () => {
        const pg = readPostgres(
            'CREATE TABLE t (a int, b int GENERATED ALWAYS AS (a * 2) STORED);'
        );
        expect(col(pg, 't', 'b').generated).toEqual({
            expression: 'a * 2',
            stored: true,
        });
        const my = readMysql(
            'CREATE TABLE t (a int, b int AS (a + 1) VIRTUAL, c int GENERATED ALWAYS AS (a) STORED);'
        );
        expect(col(my, 't', 'b').generated).toEqual({
            expression: 'a + 1',
            stored: false,
        });
        expect(col(my, 't', 'c').generated?.stored).toBe(true);
        const ms = readSqlServer(
            'CREATE TABLE t (a int, b AS (a * 2) PERSISTED, c AS (a))'
        );
        expect(col(ms, 't', 'b')).toMatchObject({
            typeName: 'varchar',
            generated: { expression: 'a * 2', stored: true },
        });
        expect(col(ms, 't', 'c').generated?.stored).toBe(false);
        expect(messages(ms)).toContain(
            'Computed column b has no type in the script: it was imported as varchar.'
        );
    });

    it('reads inline constraints, checks, comments and collations', () => {
        const r = readMysql(`CREATE TABLE t (
  a int CONSTRAINT nn NOT NULL UNIQUE CHECK (a > 0) COMMENT = 'the a',
  b varchar(9) NULL COLLATE utf8mb4_bin COMMENT 'it''s',
  c timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP(3) NOT NULL,
  d int CHECK ()
);`);
        expect(col(r, 't', 'a')).toMatchObject({
            nullable: false,
            unique: true,
            comment: 'the a',
        });
        expect(table(r, 't').checks).toEqual(['a > 0']);
        expect(col(r, 't', 'b')).toMatchObject({
            nullable: true,
            comment: "it's",
        });
        expect(col(r, 't', 'c')).toMatchObject({
            default: 'CURRENT_TIMESTAMP',
            nullable: false,
        });
    });

    it('reports MySQL inline REFERENCES as an error', () => {
        const r = readMysql(
            'CREATE TABLE p (id int PRIMARY KEY); CREATE TABLE c (pid int REFERENCES p(id));'
        );
        expect(errors(r)[0]).toMatch(/does not support inline REFERENCES/);
        expect(r.foreignKeys).toEqual([]);
    });

    it('reads inline REFERENCES with the referential tail in other dialects', () => {
        const r = readPostgres(`CREATE TABLE c (
  a int REFERENCES p (id) ON DELETE SET DEFAULT (a) ON UPDATE NO ACTION MATCH FULL DEFERRABLE INITIALLY DEFERRED,
  b int REFERENCES s.p NOT DEFERRABLE,
  c int REFERENCES p ON DELETE RESTRICT NOT ENFORCED,
  d int REFERENCES p ENFORCED,
  e int ON DELETE CASCADE,
  f int REFERENCES
);`);
        expect(
            r.foreignKeys.map((f) => [
                f.columns[0],
                f.refTable.schema,
                f.refTable.name,
                f.refColumns,
            ])
        ).toEqual([
            ['a', undefined, 'p', ['id']],
            ['b', 's', 'p', []],
            ['c', undefined, 'p', []],
            ['d', undefined, 'p', []],
        ]);
        expect(table(r, 'c').columns.map((x) => x.name)).toEqual([
            'a',
            'b',
            'c',
            'd',
            'e',
            'f',
        ]);
    });

    it('reads SQL Server column options it does not keep', () => {
        const r = readSqlServer(
            'CREATE TABLE t (id uniqueidentifier ROWGUIDCOL NOT NULL, s varchar(9) SPARSE NULL, x int (5))'
        );
        expect(col(r, 't', 'id').nullable).toBe(false);
        expect(col(r, 't', 's').nullable).toBe(true);
        expect(col(r, 't', 'x').typeName).toBe('int');
    });
});

describe('CREATE VIEW', () => {
    it('reads names from the select list, aliases and qualified columns', () => {
        const r = readPostgres(`CREATE TABLE t (a int, b int, c int);
CREATE VIEW v AS SELECT DISTINCT t.a, b AS bee, count(*) total, "x" "y", 'lit' "z", (c) cc, upper(b) FROM t;`);
        expect(table(r, 'v').columns.map((c) => c.name)).toEqual([
            'a',
            'bee',
            'total',
            'y',
            'z',
            'cc',
        ]);
        expect(table(r, 'v').view).toBe(true);
    });

    it('reads DISTINCT ON, a parenthesised body and a materialized view', () => {
        const r = readPostgres(
            'CREATE MATERIALIZED VIEW IF NOT EXISTS mv WITH (fillfactor = 70) AS (SELECT DISTINCT ON (a) a, b FROM t);'
        );
        expect(table(r, 'mv')).toMatchObject({
            view: true,
            materialized: true,
        });
        expect(table(r, 'mv').columns.map((c) => c.name)).toEqual(['a', 'b']);
    });

    it('reads SQL Server TOP n PERCENT and an explicit column list', () => {
        const ms = readSqlServer(
            'CREATE VIEW v AS SELECT TOP 10 PERCENT a, b FROM t\nGO\nCREATE VIEW w (x, y) AS SELECT 1, 2'
        );
        expect(table(ms, 'v').columns.map((c) => c.name)).toEqual(['a', 'b']);
        expect(table(ms, 'w').columns.map((c) => [c.name, c.typeName])).toEqual(
            [
                ['x', 'varchar'],
                ['y', 'varchar'],
            ]
        );
    });

    it('warns when no column can be read (SELECT *, VALUES)', () => {
        const r = readPostgres(
            'CREATE VIEW v AS SELECT * FROM t; CREATE VIEW w AS VALUES (1);'
        );
        expect(table(r, 'v').columns).toEqual([]);
        expect(messages(r)).toContain(
            'View v has no columns that can be read from its definition.'
        );
        expect(messages(r)).toContain(
            'View w has no columns that can be read from its definition.'
        );
    });

    it('reads MySQL views with DEFINER, ALGORITHM and SQL SECURITY', () => {
        const r = readMysql(
            'CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `v` AS select `t`.`a` AS `a` from `t`;'
        );
        expect(table(r, 'v').columns.map((c) => c.name)).toEqual(['a']);
    });
});

describe('CREATE INDEX', () => {
    it('reads a unique partial index with USING, DESC and WHERE', () => {
        const r = readPostgres(`CREATE TABLE t (a int, b text);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ix ON ONLY public.t USING btree (a DESC, b) WHERE (a > 0 AND b <> '');`);
        expect(r.indexes[0]).toMatchObject({
            name: 'ix',
            unique: true,
            columns: ['a', 'b'],
            descending: ['a'],
            method: 'btree',
            where: "(a > 0 AND b <> '')",
        });
    });

    it('names an unnamed index and skips expressions with a warning', () => {
        const r = readPostgres(
            'CREATE TABLE t (a text); CREATE INDEX ON t (lower(a), a);'
        );
        expect(r.indexes[0].name).toBe('t_a_idx');
        expect(messages(r)).toContain(
            'Index t_a_idx: the expression lower(a) is not kept (only plain columns are).'
        );
    });

    it('keeps a prefix length column and ignores an unknown USING method', () => {
        const r = readPostgres(
            'CREATE TABLE t (a text); CREATE INDEX i ON t USING nosuch (a(10));'
        );
        expect(r.indexes[0]).toMatchObject({
            columns: ['a'],
            method: undefined,
        });
    });

    it('reads SQL Server index kinds, INCLUDE, filters and WITH options', () => {
        const r = readSqlServer(`CREATE TABLE t (a int, b int, x xml)
GO
CREATE NONCLUSTERED INDEX i1 ON dbo.t (a) INCLUDE (b) WHERE a IS NOT NULL WITH (ONLINE = ON) ON [PRIMARY]
GO
CREATE CLUSTERED INDEX i2 ON t (a)
GO
CREATE NONCLUSTERED COLUMNSTORE INDEX i3 ON t (a, b)
GO
CREATE PRIMARY XML INDEX i4 ON t (x)
GO
CREATE SPATIAL INDEX i5 ON t (a)
GO
CREATE INDEX i6 ON t (a) WHERE
GO`);
        expect(r.indexes.map((i) => [i.name, i.method, i.where])).toEqual([
            ['i1', 'nonclustered', 'a IS NOT NULL'],
            ['i2', 'clustered', undefined],
            ['i3', 'columnstore', undefined],
            ['i4', 'xml', undefined],
            ['i5', 'spatial', undefined],
            ['i6', undefined, undefined],
        ]);
        expect(messages(r)).toContain(
            'Index i1: its INCLUDE columns are not kept.'
        );
    });

    it('reads MySQL FULLTEXT and Oracle BITMAP indexes', () => {
        const my = readMysql(
            'CREATE TABLE t (a text); CREATE FULLTEXT INDEX f ON t (a);'
        );
        expect(my.indexes[0].method).toBe('fulltext');
        const ora = readOracle(
            'CREATE TABLE t (a int); CREATE BITMAP INDEX b ON t (a) TABLESPACE users;'
        );
        expect(ora.indexes[0].method).toBe('bitmap');
    });

    it('ignores an index without ON or a table', () => {
        const r = readPostgres(
            'CREATE TABLE t (a int); CREATE INDEX i; CREATE INDEX j ON;'
        );
        expect(r.indexes).toEqual([]);
    });
});

describe('CREATE DOMAIN and CREATE TYPE', () => {
    it('gives a domain column its base type and keeps the domain name', () => {
        const r =
            readPostgres(`CREATE DOMAIN money2 AS numeric(12, 2) DEFAULT 0 CHECK (VALUE >= 0);
CREATE DOMAIN price AS money2;
CREATE DOMAIN code AS varchar(5) COLLATE "C";
CREATE DOMAIN tags AS text[];
CREATE TABLE t (p price, c code, g tags);`);
        expect(col(r, 't', 'p')).toMatchObject({
            domain: 'price',
            typeName: 'numeric',
            precision: 12,
            scale: 2,
        });
        expect(col(r, 't', 'c')).toMatchObject({
            typeName: 'varchar',
            length: 5,
        });
        expect(col(r, 't', 'g').isArray).toBe(true);
        expect(messages(r)).toContain(
            'Domain money2: its DEFAULT, CHECK are not kept (the column keeps the domain name and its base type).'
        );
        expect(messages(r)).toContain(
            'Domain code: its COLLATE is not kept (the column keeps the domain name and its base type).'
        );
    });

    it('ignores a domain without a name or a type', () => {
        const r = readPostgres(
            'CREATE DOMAIN; CREATE DOMAIN d AS; CREATE TABLE t (a d);'
        );
        expect(col(r, 't', 'a')).toMatchObject({ typeName: 'd' });
        expect(col(r, 't', 'a').domain).toBeUndefined();
    });

    it('reads an enum and skips other types', () => {
        const r =
            readPostgres(`CREATE TYPE s.mood AS ENUM ('calm', 'it''s', 'busy');
CREATE TYPE pair AS (a int, b int);
CREATE TYPE;
CREATE TABLE t (id int);`);
        expect(r.enums).toEqual([
            { schema: 's', name: 'mood', values: ['calm', "it's", 'busy'] },
        ]);
        expect(messages(r)).toContain(
            '1 CREATE TYPE that is not an enum statement skipped: not imported.'
        );
    });
});

describe('ALTER TABLE', () => {
    it('adds keys, checks, indexes and foreign keys to a table', () => {
        const r = readPostgres(`CREATE TABLE p (id int);
CREATE TABLE t (a int, b int, c int);
ALTER TABLE ONLY p ADD CONSTRAINT p_pkey PRIMARY KEY (id);
ALTER TABLE IF EXISTS t
  ADD CONSTRAINT uq UNIQUE (a, b),
  ADD CHECK (c > 0),
  ADD CONSTRAINT fk FOREIGN KEY (a) REFERENCES p (id),
  ADD CONSTRAINT bad FOREIGN KEY (b);`);
        expect(table(r, 'p').primaryKey).toEqual({
            name: 'p_pkey',
            columns: ['id'],
        });
        expect(col(r, 'p', 'id').primary).toBe(true);
        expect(table(r, 't').uniqueKeys).toEqual([
            { name: 'uq', columns: ['a', 'b'] },
        ]);
        expect(table(r, 't').checks).toEqual(['c > 0']);
        expect(r.foreignKeys.map((f) => f.name)).toEqual(['fk']);
    });

    it('adds a MySQL index through ALTER TABLE ... ADD INDEX', () => {
        const r = readMysql(
            'CREATE TABLE t (a int); ALTER TABLE t ADD INDEX (a DESC), ADD KEY k USING BTREE (a);'
        );
        expect(r.indexes.map((i) => [i.name, i.descending, i.method])).toEqual([
            ['t_a_idx', ['a'], undefined],
            ['k', undefined, 'btree'],
        ]);
    });

    it('adds columns, with an inline key and a reference', () => {
        const r = readPostgres(`CREATE TABLE p (id int PRIMARY KEY);
CREATE TABLE t (a int PRIMARY KEY);
ALTER TABLE t ADD COLUMN IF NOT EXISTS b int PRIMARY KEY CHECK (b > 1);
ALTER TABLE t ADD c int REFERENCES p (id);
ALTER TABLE t ADD COLUMN a text;`);
        expect(table(r, 't').columns.map((c) => [c.name, c.typeName])).toEqual([
            ['a', 'int'],
            ['b', 'int'],
            ['c', 'int'],
        ]);
        expect(table(r, 't').primaryKey).toEqual({ columns: ['a', 'b'] });
        expect(table(r, 't').checks).toEqual(['b > 1']);
        expect(r.foreignKeys[0]).toMatchObject({
            columns: ['c'],
            refTable: { name: 'p' },
        });
    });

    it('alters a column type, default and nullability', () => {
        const r =
            readPostgres(`CREATE TABLE t (a varchar(5), b int, c int NOT NULL, d numeric(4, 1));
ALTER TABLE t ALTER COLUMN a TYPE numeric(10, 2);
ALTER TABLE t ALTER COLUMN d SET DATA TYPE text;
ALTER TABLE t ALTER b SET DEFAULT 42 + 1;
ALTER TABLE t ALTER COLUMN b SET NOT NULL;
ALTER TABLE t ALTER COLUMN c DROP NOT NULL;
ALTER TABLE t ALTER COLUMN nope SET NOT NULL;
ALTER TABLE t ALTER COLUMN b SET DEFAULT;`);
        expect(col(r, 't', 'a')).toMatchObject({
            typeName: 'numeric',
            precision: 10,
            scale: 2,
        });
        expect(col(r, 't', 'a').length).toBeUndefined();
        expect(col(r, 't', 'd').typeName).toBe('text');
        expect(col(r, 't', 'd').precision).toBeUndefined();
        expect(col(r, 't', 'b')).toMatchObject({
            default: '42 + 1',
            nullable: false,
        });
        expect(col(r, 't', 'c').nullable).toBe(true);
    });

    it('reports an ALTER TABLE on a missing table and still keeps its foreign key', () => {
        const r = readPostgres(`CREATE TABLE p (id int);
ALTER TABLE ghost ADD CONSTRAINT fk FOREIGN KEY (a) REFERENCES p (id);
ALTER TABLE ghost ADD PRIMARY KEY (a);`);
        expect(messages(r)).toContain(
            'ALTER TABLE ignored: table ghost is not in the script.'
        );
        expect(r.foreignKeys.map((f) => f.name)).toEqual(['fk']);
    });

    it('warns when an unqualified name matches tables in two schemas', () => {
        const r = readPostgres(`CREATE TABLE a.t (id int);
CREATE TABLE b.t (id int);
ALTER TABLE t ADD PRIMARY KEY (id);`);
        expect(messages(r)).toContain(
            'ALTER TABLE names t without a schema and several schemas have it: the first was used.'
        );
        expect(r.tables[0].primaryKey).toEqual({ columns: ['id'] });
    });

    it('reads WITH CHECK / NOCHECK and counts row level security', () => {
        const ms = readSqlServer(`CREATE TABLE p (id int)
GO
CREATE TABLE t (a int)
GO
ALTER TABLE t WITH CHECK ADD CONSTRAINT fk1 FOREIGN KEY (a) REFERENCES p (id)
GO
ALTER TABLE t WITH NOCHECK ADD CONSTRAINT fk2 FOREIGN KEY (a) REFERENCES p (id)
GO`);
        expect(ms.foreignKeys.map((f) => f.name)).toEqual(['fk1', 'fk2']);
        const pg = readPostgres(`CREATE TABLE t (a int);
ALTER TABLE t ENABLE ROW LEVEL SECURITY;
ALTER TABLE t FORCE ROW LEVEL SECURITY;
ALTER TABLE t ENABLE TRIGGER ALL;
ALTER TABLE;`);
        expect(messages(pg)).toContain(
            '2 ALTER TABLE ... ROW LEVEL SECURITY statements skipped: not imported.'
        );
    });
});

describe('COMMENT ON', () => {
    it('sets table and column comments, with and without schemas', () => {
        const r = readPostgres(`CREATE TABLE s.t (id int);
COMMENT ON TABLE s.t IS 'the table';
COMMENT ON COLUMN s.t.id IS 'it''s the key';`);
        expect(table(r, 't').comment).toBe('the table');
        expect(col(r, 't', 'id').comment).toBe("it's the key");
    });

    it('reports a comment on a missing table or column and ignores other targets', () => {
        const r = readPostgres(`CREATE TABLE t (id int);
COMMENT ON TABLE ghost IS 'x';
COMMENT ON COLUMN t.nope IS 'x';
COMMENT ON INDEX i IS 'x';
COMMENT ON TABLE t;
COMMENT ON TABLE t IS NULL;`);
        expect(messages(r)).toContain(
            'COMMENT ON ignored: table ghost is not in the script.'
        );
        expect(messages(r)).toContain(
            'COMMENT ON COLUMN ignored: column nope is not in table t.'
        );
        expect(table(r, 't').comment).toBeUndefined();
    });
});
