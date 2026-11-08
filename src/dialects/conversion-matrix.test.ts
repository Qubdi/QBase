import { describe, expect, it } from 'vitest';
import type { DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import { seededRandom } from '@/core/model/ids';
import { DesignBuilder } from '@/formats/shared/design-builder';
import type {
    ColumnSpec,
    IndexSpec,
    LinkSpec,
    TableSpec,
} from '@/formats/shared/design-builder';
import { exportSql } from '@/formats/sql/export-sql';
import { importSql } from '@/formats/sql/import-sql';

/** The six databases a diagram can be for, and so the six a script can be written for. */
const DATABASES = [
    'postgresql',
    'mysql',
    'mariadb',
    'sql_server',
    'sqlite',
    'oracle',
] as const;
type Db = (typeof DATABASES)[number];

const col = (
    name: string,
    typeName: string,
    o: Partial<ColumnSpec> = {}
): ColumnSpec => ({ name, typeName, nullable: true, ...o });

function build(
    type: DatabaseType,
    tables: Partial<TableSpec>[],
    links: LinkSpec[] = []
): Design {
    const b = new DesignBuilder({
        databaseType: type,
        name: 'matrix',
        now: Date.UTC(2026, 10, 7),
        random: seededRandom(11),
        sort: false,
    });
    for (const t of tables)
        b.addTable({
            name: 't',
            columns: [],
            indexes: [],
            checks: [],
            ...t,
        } as TableSpec);
    for (const l of links) b.addLink(l);
    return b.build();
}

/** The same columns, each written the way the database itself spells them. */
const NATIVE: Record<Db, ColumnSpec[]> = {
    postgresql: [
        col('id', 'integer', {
            primary: true,
            nullable: false,
            numbered: true,
        }),
        col('name', 'varchar', { length: 50, nullable: false }),
        col('price', 'numeric', { precision: 10, scale: 2 }),
        col('active', 'boolean', { default: 'true' }),
        col('created', 'timestamp', { default: 'now()' }),
        col('note', 'text'),
        col('uid', 'uuid', { default: 'gen_random_uuid()' }),
        col('payload', 'bytea'),
        col('ratio', 'double precision'),
    ],
    mysql: [
        col('id', 'int', { primary: true, nullable: false, numbered: true }),
        col('name', 'varchar', { length: 50, nullable: false }),
        col('price', 'decimal', { precision: 10, scale: 2 }),
        col('active', 'bool', { default: '1' }),
        col('created', 'datetime', { default: 'CURRENT_TIMESTAMP' }),
        col('note', 'longtext'),
        col('uid', 'char', { length: 36, default: 'uuid()' }),
        col('payload', 'blob'),
        col('ratio', 'double'),
    ],
    mariadb: [
        col('id', 'int', { primary: true, nullable: false, numbered: true }),
        col('name', 'varchar', { length: 50, nullable: false }),
        col('price', 'decimal', { precision: 10, scale: 2 }),
        col('active', 'bool', { default: '1' }),
        col('created', 'datetime', { default: 'CURRENT_TIMESTAMP' }),
        col('note', 'longtext'),
        col('uid', 'uuid', { default: 'uuid()' }),
        col('payload', 'blob'),
        col('ratio', 'double'),
    ],
    sql_server: [
        col('id', 'int', { primary: true, nullable: false, numbered: true }),
        col('name', 'varchar', { length: 50, nullable: false }),
        col('price', 'decimal', { precision: 10, scale: 2 }),
        col('active', 'bit', { default: '((1))' }),
        col('created', 'datetime2', { default: '(getdate())' }),
        col('note', 'varchar', { length: 'max' }),
        col('uid', 'uniqueidentifier', { default: '(newid())' }),
        col('payload', 'varbinary', { length: 'max' }),
        col('ratio', 'float'),
    ],
    sqlite: [
        col('id', 'integer', {
            primary: true,
            nullable: false,
            numbered: true,
        }),
        col('name', 'varchar', { length: 50, nullable: false }),
        col('price', 'decimal', { precision: 10, scale: 2 }),
        col('active', 'boolean', { default: '1' }),
        col('created', 'timestamp', { default: 'CURRENT_TIMESTAMP' }),
        col('note', 'text'),
        col('payload', 'blob'),
        col('ratio', 'real'),
    ],
    oracle: [
        col('id', 'number', {
            primary: true,
            nullable: false,
            numbered: true,
            precision: 10,
        }),
        col('name', 'varchar2', { length: 50, nullable: false }),
        col('price', 'number', { precision: 10, scale: 2 }),
        col('created', 'timestamp', { default: 'CURRENT_TIMESTAMP' }),
        col('note', 'clob'),
        col('uid', 'raw', { length: 16, default: 'SYS_GUID()' }),
        col('payload', 'blob'),
        col('ratio', 'binary_double'),
    ],
};

/**
 * What every other database must write for those columns: one pattern per
 * column, the same whichever database the diagram came from (a regular
 * expression where the size depends on the source, such as INT or BIGINT).
 */
const EXPECTED: Record<Db, Record<string, RegExp>> = {
    postgresql: {
        id: /^"id" (big)?serial NOT NULL,$/,
        name: /^"name" varchar\(50\) NOT NULL,$/,
        price: /^"price" numeric\(10, 2\),$/,
        created: /^"created" timestamp DEFAULT CURRENT_TIMESTAMP,$/,
        note: /^"note" text,$/,
        payload: /^"payload" bytea,$/,
        ratio: /^"ratio" double precision,?$/,
    },
    mysql: {
        id: /^`id` (INT|BIGINT) NOT NULL AUTO_INCREMENT,$/,
        name: /^`name` VARCHAR\(50\) NOT NULL,$/,
        price: /^`price` DECIMAL\(10, 2\),$/,
        created: /^`created` DATETIME DEFAULT CURRENT_TIMESTAMP,$/,
        note: /^`note` (TEXT|LONGTEXT),$/,
        payload: /^`payload` (BLOB|LONGBLOB),$/,
        ratio: /^`ratio` DOUBLE,?$/,
    },
    mariadb: {
        id: /^`id` (INT|BIGINT) NOT NULL AUTO_INCREMENT,$/,
        name: /^`name` VARCHAR\(50\) NOT NULL,$/,
        price: /^`price` DECIMAL\(10, 2\),$/,
        created: /^`created` DATETIME DEFAULT CURRENT_TIMESTAMP,$/,
        note: /^`note` (TEXT|LONGTEXT),$/,
        payload: /^`payload` (BLOB|LONGBLOB),$/,
        ratio: /^`ratio` DOUBLE,?$/,
    },
    sql_server: {
        id: /^\[id\] (INT|BIGINT) IDENTITY\(1,1\) NOT NULL,$/,
        name: /^\[name\] VARCHAR\(50\) NOT NULL,$/,
        price: /^\[price\] DECIMAL\(10, 2\) NULL,$/,
        created: /^\[created\] DATETIME2 NULL DEFAULT GETDATE\(\),$/,
        note: /^\[note\] NVARCHAR\(MAX\) NULL,$/,
        payload: /^\[payload\] VARBINARY\(MAX\) NULL,$/,
        ratio: /^\[ratio\] FLOAT NULL,?$/,
    },
    sqlite: {
        id: /^"id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,$/,
        name: /^"name" VARCHAR\(50\) NOT NULL,$/,
        price: /^"price" DECIMAL\(10, 2\),$/,
        created: /^"created" DATETIME DEFAULT CURRENT_TIMESTAMP,$/,
        note: /^"note" TEXT,$/,
        payload: /^"payload" BLOB,$/,
        ratio: /^"ratio" REAL,?$/,
    },
    oracle: {
        id: /^"id" NUMBER\((10|19)\) GENERATED BY DEFAULT AS IDENTITY NOT NULL,$/,
        name: /^"name" VARCHAR2\(50 CHAR\) NOT NULL,$/,
        price: /^"price" NUMBER\(10, 2\),$/,
        created: /^"created" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,$/,
        note: /^"note" CLOB,$/,
        payload: /^"payload" BLOB,$/,
        ratio: /^"ratio" BINARY_DOUBLE,?$/,
    },
};

/** The boolean and uuid columns, which only some sources have. */
const BOOLEAN: Record<Db, RegExp> = {
    postgresql: /^"active" boolean DEFAULT true,$/,
    mysql: /^`active` TINYINT\(1\) DEFAULT 1,$/,
    mariadb: /^`active` TINYINT\(1\) DEFAULT 1,$/,
    sql_server: /^\[active\] BIT NULL DEFAULT 1,$/,
    sqlite: /^"active" BOOLEAN DEFAULT 1,$/,
    oracle: /^"active" NUMBER\(1\) DEFAULT 1,$/,
};
const UUID: Record<Db, RegExp> = {
    postgresql: /^"uid" (uuid|char\(36\)) DEFAULT gen_random_uuid\(\),$/,
    mysql: /^`uid` CHAR\(36\) DEFAULT \(UUID\(\)\),$/,
    mariadb: /^`uid` CHAR\(36\) DEFAULT \(UUID\(\)\),$/,
    sql_server:
        /^\[uid\] (UNIQUEIDENTIFIER|CHAR\(36\)) NULL DEFAULT (NEWID\(\)|CONVERT\(VARCHAR\(36\), NEWID\(\)\)),$/,
    sqlite: /^"uid" CHAR\(36\) DEFAULT \(lower\(hex\(randomblob\(4\)\)\)/,
    oracle: /^"uid" (RAW\(16\)|CHAR\(36 CHAR\)) DEFAULT (SYS_GUID\(\)|RAWTOHEX\(SYS_GUID\(\)\)),$/,
};

const sameFamily = (a: Db, b: Db): boolean =>
    a === b || (a !== 'sql_server' && a.startsWith('m') && b.startsWith('m'));

/** The lines of a column list, indented lines of the CREATE TABLE. */
const lines = (text: string): string[] => text.split('\n').map((l) => l.trim());

const PAIRS = DATABASES.flatMap((from) =>
    DATABASES.filter((to) => !sameFamily(from, to)).map(
        (to) => [from, to] as const
    )
);

describe('every pair of databases: the columns', () => {
    it('has 24 pairs between the six databases, MySQL and MariaDB sharing a writer', () => {
        expect(PAIRS).toHaveLength(6 * 5 - 2);
    });

    for (const [from, to] of PAIRS)
        it(`${from} to ${to}`, () => {
            const result = exportSql(
                build(from, [{ name: 't', columns: NATIVE[from] }]),
                to
            );
            expect(result.diagnostics).toEqual([]);
            const out = lines(result.text);
            expect(out[0]).toBe(
                `-- ${from === 'sql_server' ? 'SQL Server' : { postgresql: 'PostgreSQL', mysql: 'MySQL', mariadb: 'MariaDB', sqlite: 'SQLite', oracle: 'Oracle' }[from]} to ${to === 'sql_server' ? 'SQL Server' : { postgresql: 'PostgreSQL', mysql: 'MySQL', mariadb: 'MariaDB', sqlite: 'SQLite', oracle: 'Oracle' }[to]} conversion`
            );
            for (const [column, pattern] of Object.entries(EXPECTED[to])) {
                const line = out.find((l) =>
                    new RegExp(`^[\`"\\[]${column}[\`"\\]] `).test(l)
                );
                expect(line, `${column}: ${result.text}`).toMatch(pattern);
            }
            if (NATIVE[from].some((c) => c.name === 'active'))
                expect(
                    out.find((l) => /^[`"[]active[`"\]] /.test(l)),
                    result.text
                ).toMatch(BOOLEAN[to]);
            if (NATIVE[from].some((c) => c.name === 'uid'))
                expect(
                    out.find((l) => /^[`"[]uid[`"\]] /.test(l)),
                    result.text
                ).toMatch(UUID[to]);
        });
});

/** Tables with a schema, comments, an index, a check and a foreign key. */
const SHOP: Partial<TableSpec>[] = [
    {
        name: 'customers',
        schema: 'shop',
        comment: 'People who buy',
        columns: [
            col('id', 'integer', {
                primary: true,
                nullable: false,
                numbered: true,
            }),
            col('email', 'varchar', {
                length: 120,
                nullable: false,
                unique: true,
                comment: 'Login name',
            }),
        ],
    },
    {
        name: 'orders',
        schema: 'shop',
        columns: [
            col('id', 'integer', {
                primary: true,
                nullable: false,
                numbered: true,
            }),
            col('customer_id', 'integer', { nullable: false }),
            col('qty', 'integer', { nullable: false }),
            col('placed', 'integer'),
        ],
        indexes: [
            {
                name: 'idx_orders_customer',
                unique: true,
                columns: ['customer_id', 'placed'],
                descending: ['placed'],
            } satisfies IndexSpec,
        ],
        checks: ['qty > 0'],
    },
];
const SHOP_LINKS: LinkSpec[] = [
    {
        name: 'fk_orders_customers',
        from: { schema: 'shop', table: 'customers', column: 'id' },
        to: { schema: 'shop', table: 'orders', column: 'customer_id' },
    },
];

describe('every pair of databases: tables, keys, comments and schemas', () => {
    for (const from of DATABASES)
        for (const to of DATABASES) {
            if (sameFamily(from, to)) continue;
            it(`${from} to ${to}`, () => {
                const { text } = exportSql(build(from, SHOP, SHOP_LINKS), to);
                const q: Record<Db, (n: string) => string> = {
                    postgresql: (n) => `"${n}"`,
                    mysql: (n) => `\`${n}\``,
                    mariadb: (n) => `\`${n}\``,
                    sql_server: (n) => `[${n}]`,
                    sqlite: (n) => `"${n}"`,
                    oracle: (n) => `"${n}"`,
                };
                const name = q[to];
                const orders =
                    to === 'sqlite'
                        ? name('shop_orders')
                        : `${name('shop')}.${name('orders')}`;
                expect(text).toContain(`CREATE TABLE ${orders} (`);
                // schemas: made where the database has them, a note for Oracle
                if (to === 'postgresql')
                    expect(text).toContain(
                        'CREATE SCHEMA IF NOT EXISTS "shop";'
                    );
                if (to === 'mysql' || to === 'mariadb')
                    expect(text).toContain(
                        'CREATE DATABASE IF NOT EXISTS `shop`;'
                    );
                if (to === 'sql_server')
                    expect(text).toContain("EXEC('CREATE SCHEMA [shop]')");
                if (to === 'sqlite')
                    expect(text).toContain(
                        'SQLite has no schemas: table names are prefixed'
                    );
                if (to === 'oracle') {
                    expect(text).not.toContain('CREATE SCHEMA');
                    expect(text).toContain('Oracle schemas are users');
                }
                // the key (SQLite writes a numbered key inside the column) and the check
                expect(text).toContain(
                    to === 'sqlite'
                        ? `${name('id')} INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT`
                        : `PRIMARY KEY (${name('id')})`
                );
                expect(text).toContain(`CHECK (${name('qty')} > 0)`);
                // the foreign key
                if (to === 'sqlite')
                    expect(text).toContain(
                        `FOREIGN KEY (${name('customer_id')}) REFERENCES ${name('shop_customers')} (${name('id')})`
                    );
                else
                    expect(text).toContain(
                        `ALTER TABLE ${orders} ADD CONSTRAINT ${name('fk_orders_customers')} FOREIGN KEY (${name('customer_id')}) REFERENCES ${name('shop')}.${name('customers')} (${name('id')});`
                    );
                // the index, unique and descending
                expect(text).toContain(
                    `CREATE UNIQUE INDEX ${name('idx_orders_customer')} ON ${orders} (${name('customer_id')}, ${name('placed')} DESC);`
                );
                // comments
                const comment = 'People who buy';
                if (to === 'postgresql' || to === 'oracle') {
                    expect(text).toContain(
                        `COMMENT ON TABLE ${name('shop')}.${name('customers')} IS '${comment}';`
                    );
                    expect(text).toContain(
                        `COMMENT ON COLUMN ${name('shop')}.${name('customers')}.${name('email')} IS 'Login name';`
                    );
                } else if (to === 'mysql' || to === 'mariadb') {
                    expect(text).toContain(`COMMENT='${comment}'`);
                    expect(text).toContain("COMMENT 'Login name'");
                } else {
                    expect(text).toContain(`-- ${comment}`);
                    expect(text).toContain('-- Login name');
                }
            });
        }
});

describe('every pair of databases: what is written can be read back', () => {
    const counts = (d: Design | undefined) => ({
        tables: d ? Object.keys(d.entities.byId).length : -1,
        columns: d ? Object.keys(d.columns).length : -1,
        links: d ? Object.keys(d.links.byId).length : -1,
    });
    for (const from of DATABASES)
        for (const to of DATABASES) {
            if (from === to) continue;
            it(`${from} to ${to} reads back as the same tables, columns and relationship`, () => {
                const { text } = exportSql(build(from, SHOP, SHOP_LINKS), to);
                const back = importSql(text, to);
                expect(
                    back.diagnostics.filter((d) => d.severity === 'error'),
                    text
                ).toEqual([]);
                expect(counts(back.design)).toEqual({
                    tables: 2,
                    columns: 6,
                    links: 1,
                });
            });
        }
});

describe('a diagram written for its own database', () => {
    for (const db of DATABASES)
        it(`${db} keeps its own types and reads back`, () => {
            const { text } = exportSql(
                build(db, [{ name: 't', columns: NATIVE[db] }]),
                db
            );
            expect(text).not.toMatch(/conversion/);
            const back = importSql(text, db);
            expect(
                back.diagnostics.filter((d) => d.severity === 'error'),
                text
            ).toEqual([]);
            const names = Object.values(back.design!.columns).map(
                (c) => c.name
            );
            expect(names).toEqual(NATIVE[db].map((c) => c.name));
        });
});

/** One column, one source, one target: the text written for the column. */
function column(
    from: Db,
    to: Db,
    spec: ColumnSpec,
    extra: Partial<TableSpec> = {}
): { line: string; text: string } {
    const { text } = exportSql(
        build(from, [
            { name: 't', columns: [spec, col('z', 'integer')], ...extra },
        ]),
        to
    );
    const line = (
        lines(text).find((l) =>
            new RegExp(`^[\`"\\[]${spec.name}[\`"\\]] `).test(l)
        ) ?? ''
    ).replace(/ -- Was: .*$/, '');
    return { line, text };
}

describe('SQL Server to PostgreSQL', () => {
    const cases: [ColumnSpec, string][] = [
        [col('a', 'nvarchar', { length: 'max' }), '"a" text,'],
        [col('a', 'nvarchar', { length: 40 }), '"a" varchar(40),'],
        [col('a', 'uniqueidentifier'), '"a" uuid,'],
        [col('a', 'bit'), '"a" boolean,'],
        [col('a', 'tinyint'), '"a" smallint,'],
        [col('a', 'money'), '"a" numeric(19, 4),'],
        [col('a', 'smallmoney'), '"a" numeric(10, 4),'],
        [col('a', 'datetime'), '"a" timestamp,'],
        [col('a', 'datetime2'), '"a" timestamp,'],
        [col('a', 'datetimeoffset'), '"a" timestamptz,'],
        [col('a', 'varbinary', { length: 'max' }), '"a" bytea,'],
        [col('a', 'float'), '"a" double precision,'],
        [col('a', 'real'), '"a" real,'],
        [col('a', 'xml'), '"a" xml,'],
        [col('a', 'bigint', { default: '((0))' }), '"a" bigint DEFAULT 0,'],
        [col('a', 'bit', { default: '((1))' }), '"a" boolean DEFAULT true,'],
        [col('a', 'bit', { default: '((0))' }), '"a" boolean DEFAULT false,'],
        [
            col('a', 'datetime', { default: '(getdate())' }),
            '"a" timestamp DEFAULT CURRENT_TIMESTAMP,',
        ],
        [
            col('a', 'uniqueidentifier', { default: '(newid())' }),
            '"a" uuid DEFAULT gen_random_uuid(),',
        ],
        [
            col('a', 'nvarchar', { length: 10, default: "(N'x')" }),
            `"a" varchar(10) DEFAULT 'x',`,
        ],
        [
            col('a', 'int', { primary: true, nullable: false, numbered: true }),
            '"a" serial NOT NULL,',
        ],
        [
            col('a', 'bigint', {
                primary: true,
                nullable: false,
                numbered: true,
            }),
            '"a" bigserial NOT NULL,',
        ],
    ];
    for (const [spec, expected] of cases)
        it(`${spec.typeName}${spec.default ? ` default ${spec.default}` : ''}`, () => {
            const { line, text } = column('sql_server', 'postgresql', spec);
            expect(line, text).toBe(expected);
        });

    it('writes bracketed names with double quotes and keeps a LEN check working', () => {
        const { text } = exportSql(
            build('sql_server', [
                {
                    name: 'my table',
                    columns: [col('my col', 'nvarchar', { length: 10 })],
                    checks: ["LEN([my col]) > 2 AND [my col] <> N'x'"],
                },
            ]),
            'postgresql'
        );
        expect(text).toContain('CREATE TABLE "my table" (');
        expect(text).toContain(
            `CHECK (CHAR_LENGTH("my col") > 2 AND "my col" <> 'x')`
        );
    });
});

describe('PostgreSQL to SQL Server', () => {
    const cases: [ColumnSpec, string][] = [
        [col('a', 'text'), '[a] NVARCHAR(MAX) NULL,'],
        [col('a', 'uuid'), '[a] UNIQUEIDENTIFIER NULL,'],
        [col('a', 'boolean', { default: 'false' }), '[a] BIT NULL DEFAULT 0,'],
        [col('a', 'timestamptz'), '[a] DATETIMEOFFSET NULL,'],
        [col('a', 'timestamp'), '[a] DATETIME2 NULL,'],
        [col('a', 'bytea'), '[a] VARBINARY(MAX) NULL,'],
        [col('a', 'jsonb'), '[a] NVARCHAR(MAX) NULL,'],
        [col('a', 'smallint'), '[a] SMALLINT NULL,'],
        [col('a', 'real'), '[a] REAL NULL,'],
        [
            col('a', 'uuid', { default: 'gen_random_uuid()' }),
            '[a] UNIQUEIDENTIFIER NULL DEFAULT NEWID(),',
        ],
        [
            col('a', 'timestamptz', { default: 'now()' }),
            '[a] DATETIMEOFFSET NULL DEFAULT SYSDATETIMEOFFSET(),',
        ],
        [
            col('a', 'varchar', {
                length: 5,
                default: "'x'::character varying",
            }),
            "[a] VARCHAR(5) NULL DEFAULT 'x',",
        ],
    ];
    for (const [spec, expected] of cases)
        it(`${spec.typeName}${spec.default ? ` default ${spec.default}` : ''}`, () => {
            const { line, text } = column('postgresql', 'sql_server', spec);
            expect(line, text).toBe(expected);
        });
});

describe('Oracle as a source', () => {
    const cases: [ColumnSpec, string, string][] = [
        [
            col('a', 'number', { precision: 3, scale: 0 }),
            'smallint',
            'SMALLINT',
        ],
        [col('a', 'number', { precision: 9 }), 'integer', 'INT'],
        [col('a', 'number', { precision: 18 }), 'bigint', 'BIGINT'],
        [
            col('a', 'number', { precision: 25 }),
            'numeric(25, 0)',
            'DECIMAL(25, 0)',
        ],
        [
            col('a', 'number', { precision: 12, scale: 3 }),
            'numeric(12, 3)',
            'DECIMAL(12, 3)',
        ],
        [col('a', 'number'), 'numeric', 'DECIMAL(38, 10)'],
        [col('a', 'varchar2', { length: 30 }), 'varchar(30)', 'VARCHAR(30)'],
        [col('a', 'nvarchar2', { length: 30 }), 'varchar(30)', 'NVARCHAR(30)'],
        [col('a', 'clob'), 'text', 'NVARCHAR(MAX)'],
        [col('a', 'blob'), 'bytea', 'VARBINARY(MAX)'],
        [col('a', 'raw', { length: 20 }), 'bytea', 'VARBINARY(20)'],
        [col('a', 'binary_float'), 'real', 'REAL'],
        [col('a', 'binary_double'), 'double precision', 'FLOAT'],
        [col('a', 'timestamp'), 'timestamp', 'DATETIME2'],
        [col('a', 'timestamp with time zone'), 'timestamptz', 'DATETIMEOFFSET'],
        [
            col('a', 'timestamp with local time zone'),
            'timestamptz',
            'DATETIMEOFFSET',
        ],
        [col('a', 'xmltype'), 'xml', 'XML'],
    ];
    for (const [spec, pg, ms] of cases)
        it(`${spec.typeName}${spec.precision ? `(${spec.precision}${spec.scale ? `,${spec.scale}` : ''})` : ''}`, () => {
            const toPg = column('oracle', 'postgresql', spec);
            expect(toPg.line, toPg.text).toMatch(
                new RegExp(`^"a" ${pg.replace(/[()]/g, '\\$&')},$`)
            );
            const toMs = column('oracle', 'sql_server', spec);
            expect(toMs.line, toMs.text).toMatch(
                new RegExp(`^\\[a\\] ${ms.replace(/[()]/g, '\\$&')} NULL,$`)
            );
        });

    it('keeps the time of day of a DATE, which Oracle stores with it', () => {
        const { line, text } = column('oracle', 'postgresql', col('a', 'date'));
        expect(line).toBe('"a" timestamp,');
        expect(text).toContain('Oracle DATE holds a time of day');
    });

    it('turns SYSDATE into the current time', () => {
        const { line } = column(
            'oracle',
            'postgresql',
            col('a', 'date', { default: 'SYSDATE' })
        );
        expect(line).toBe('"a" timestamp DEFAULT CURRENT_TIMESTAMP,');
    });

    it('does not give a binary column a uuid default', () => {
        const { line, text } = column(
            'oracle',
            'postgresql',
            col('a', 'raw', { length: 8, default: 'SYS_GUID()' })
        );
        expect(line).toBe('"a" bytea,');
        expect(text).toContain('was not converted');
    });
});

describe('Oracle as a target', () => {
    const cases: [Db, ColumnSpec, string][] = [
        ['postgresql', col('a', 'smallint'), '"a" NUMBER(5),'],
        ['postgresql', col('a', 'integer'), '"a" NUMBER(10),'],
        ['postgresql', col('a', 'bigint'), '"a" NUMBER(19),'],
        ['mysql', col('a', 'tinyint'), '"a" NUMBER(3),'],
        ['mysql', col('a', 'int unsigned'), '"a" NUMBER(10),'],
        ['mysql', col('a', 'bigint unsigned'), '"a" NUMBER(20),'],
        ['postgresql', col('a', 'numeric'), '"a" NUMBER,'],
        [
            'postgresql',
            col('a', 'numeric', { precision: 50, scale: 2 }),
            '"a" NUMBER(38, 2),',
        ],
        ['postgresql', col('a', 'real'), '"a" BINARY_FLOAT,'],
        ['postgresql', col('a', 'boolean'), '"a" NUMBER(1),'],
        ['postgresql', col('a', 'char', { length: 3 }), '"a" CHAR(3 CHAR),'],
        ['postgresql', col('a', 'char', { length: 3000 }), '"a" CLOB,'],
        [
            'postgresql',
            col('a', 'varchar', { length: 4000 }),
            '"a" VARCHAR2(4000 CHAR),',
        ],
        ['postgresql', col('a', 'varchar', { length: 5000 }), '"a" CLOB,'],
        ['postgresql', col('a', 'text'), '"a" CLOB,'],
        [
            'sql_server',
            col('a', 'nvarchar', { length: 40 }),
            '"a" NVARCHAR2(40),',
        ],
        ['sql_server', col('a', 'nchar', { length: 4 }), '"a" NCHAR(4),'],
        ['postgresql', col('a', 'bytea'), '"a" BLOB,'],
        ['mysql', col('a', 'binary', { length: 16 }), '"a" RAW(16),'],
        ['mysql', col('a', 'varbinary', { length: 3000 }), '"a" BLOB,'],
        ['postgresql', col('a', 'date'), '"a" DATE,'],
        ['postgresql', col('a', 'time'), '"a" TIMESTAMP,'],
        [
            'postgresql',
            col('a', 'timestamptz'),
            '"a" TIMESTAMP WITH TIME ZONE,',
        ],
        ['postgresql', col('a', 'jsonb'), '"a" CLOB,'],
        ['postgresql', col('a', 'uuid'), '"a" RAW(16),'],
        ['postgresql', col('a', 'xml'), '"a" XMLTYPE,'],
        ['postgresql', col('a', 'geometry'), '"a" SDO_GEOMETRY,'],
        ['postgresql', col('a', 'integer', { isArray: true }), '"a" CLOB,'],
    ];
    for (const [from, spec, expected] of cases)
        it(`${from} ${spec.typeName}${spec.length ? `(${spec.length})` : ''}${spec.isArray ? '[]' : ''}`, () => {
            const { line, text } = column(from, 'oracle', spec);
            expect(line, text).toBe(expected);
        });

    it('writes the default before NOT NULL, as Oracle needs', () => {
        const { line } = column(
            'postgresql',
            'oracle',
            col('a', 'varchar', { length: 5, nullable: false, default: "'x'" })
        );
        expect(line).toBe(`"a" VARCHAR2(5 CHAR) DEFAULT 'x' NOT NULL,`);
    });

    it('keeps an enum with a CHECK on its values', () => {
        const { text } = exportSql(
            (() => {
                const b = new DesignBuilder({
                    databaseType: 'postgresql',
                    name: 'e',
                    now: 0,
                    random: seededRandom(2),
                    sort: false,
                });
                b.addUserType({
                    name: 'mood',
                    kind: 'enum',
                    values: ['happy', 'sad'],
                });
                b.addTable({
                    name: 't',
                    columns: [col('m', 'mood')],
                    indexes: [],
                    checks: [],
                });
                return b.build();
            })(),
            'oracle'
        );
        expect(text).toContain('"m" VARCHAR2(255 CHAR)');
        expect(text).toContain(`CHECK ("m" IN ('happy', 'sad'))`);
    });

    it('turns TRUE and FALSE in a check into 1 and 0, which Oracle and SQL Server take', () => {
        for (const to of ['oracle', 'sql_server'] as const) {
            const { text } = exportSql(
                build('postgresql', [
                    {
                        name: 't',
                        columns: [col('ok', 'boolean')],
                        checks: ['ok = TRUE OR ok = FALSE'],
                    },
                ]),
                to
            );
            expect(text).toMatch(/CHECK \(.ok. = 1 OR .ok. = 0\)/);
        }
    });

    it('says what a boolean became, once', () => {
        const { text } = exportSql(
            build('postgresql', [
                {
                    name: 't',
                    columns: [col('a', 'boolean'), col('b', 'boolean')],
                },
            ]),
            'oracle'
        );
        expect(
            text.match(/Oracle has no boolean type before 23ai/g)?.length
        ).toBeGreaterThanOrEqual(1);
    });

    it('shortens a key column that is too long to index', () => {
        const { line, text } = column(
            'postgresql',
            'oracle',
            col('a', 'text', { primary: true, nullable: false })
        );
        expect(line).toBe('"a" VARCHAR2(4000 CHAR) NOT NULL,');
        expect(text).toContain('shortened to 4000 characters');
    });
});

describe('Oracle written for Oracle', () => {
    it('writes a numbered column as an identity, the default before NOT NULL', () => {
        const { text } = exportSql(
            build('oracle', [
                {
                    name: 'T',
                    columns: [
                        col('ID', 'number', {
                            primary: true,
                            nullable: false,
                            numbered: true,
                            precision: 10,
                        }),
                        col('NAME', 'varchar2', {
                            length: 20,
                            nullable: false,
                            default: "'x'",
                        }),
                    ],
                },
            ]),
            'oracle'
        );
        expect(text).toContain(
            '"ID" number(10) GENERATED BY DEFAULT AS IDENTITY NOT NULL'
        );
        expect(text).toContain(`"NAME" varchar2(20) DEFAULT 'x' NOT NULL`);
    });

    it('says when an index condition was left out', () => {
        const { text } = exportSql(
            build('oracle', [
                {
                    name: 'T',
                    columns: [col('A', 'number'), col('B', 'number')],
                    indexes: [
                        {
                            name: 'ix',
                            unique: false,
                            columns: ['A'],
                            where: 'B > 0',
                        },
                    ],
                },
            ]),
            'oracle'
        );
        expect(text).toContain('Oracle has no partial indexes');
    });
});

describe('MySQL and MariaDB', () => {
    it('write each other one script without a conversion', () => {
        const mysql = exportSql(
            build('mysql', [{ name: 't', columns: NATIVE.mysql }]),
            'mariadb'
        );
        const maria = exportSql(
            build('mariadb', [{ name: 't', columns: NATIVE.mysql }]),
            'mysql'
        );
        expect(mysql.diagnostics).toEqual([]);
        expect(maria.diagnostics).toEqual([]);
        expect(mysql.text).toContain('CREATE TABLE IF NOT EXISTS `t`');
        expect(maria.text).toContain('CREATE TABLE IF NOT EXISTS `t`');
        expect(mysql.text).not.toMatch(/conversion/);
        expect(maria.text).not.toMatch(/conversion/);
    });
});

describe('the diagram is not changed by being converted', () => {
    it('leaves the design as it was for every target', () => {
        for (const from of DATABASES) {
            const d = build(from, SHOP, SHOP_LINKS);
            const before = JSON.stringify(d);
            for (const to of DATABASES) exportSql(d, to);
            expect(JSON.stringify(d), from).toBe(before);
        }
    });
});
