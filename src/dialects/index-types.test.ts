import { describe, expect, it } from 'vitest';
import type { DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import { seededRandom } from '@/core/model/ids';
import type { KeyMethod } from '@/core/model/key';
import { DesignBuilder } from '@/formats/shared/design-builder';
import type { ColumnSpec, IndexSpec } from '@/formats/shared/design-builder';
import { loadFromDatabaseMetadata } from '@/formats/metadata/load';
import { exportSql } from '@/formats/sql/export-sql';
import { importSql } from '@/formats/sql/import-sql';
import type { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import { convertIndex } from './convert/convert-index';

const col = (
    name: string,
    typeName: string,
    over: Partial<ColumnSpec> = {}
): ColumnSpec => ({
    name,
    typeName,
    nullable: true,
    ...over,
});

function build(
    type: DatabaseType,
    columns: ColumnSpec[],
    indexes: IndexSpec[]
): Design {
    const b = new DesignBuilder({
        databaseType: type,
        name: 'ix',
        now: 0,
        random: seededRandom(4),
        sort: false,
    });
    b.addTable({ name: 't', columns, indexes, checks: [] });
    return b.build();
}

const index = (
    name: string,
    columns: string[],
    method?: KeyMethod,
    unique = false
): IndexSpec => ({ name, unique, columns, method });

const idColumn = col('id', 'int', { primary: true, nullable: false });

/** Each type of each database, with a column it can be made on, and the statement the database writes. */
const OWN: [DatabaseType, KeyMethod, ColumnSpec, string][] = [
    [
        'postgresql',
        'hash',
        col('a', 'text'),
        'CREATE INDEX "t_ix" ON "t" USING HASH ("a");',
    ],
    [
        'postgresql',
        'gist',
        col('a', 'text'),
        'CREATE INDEX "t_ix" ON "t" USING GIST ("a");',
    ],
    [
        'postgresql',
        'gin',
        col('a', 'jsonb'),
        'CREATE INDEX "t_ix" ON "t" USING GIN ("a");',
    ],
    [
        'postgresql',
        'spgist',
        col('a', 'text'),
        'CREATE INDEX "t_ix" ON "t" USING SPGIST ("a");',
    ],
    [
        'postgresql',
        'brin',
        col('a', 'int'),
        'CREATE INDEX "t_ix" ON "t" USING BRIN ("a");',
    ],
    [
        'mysql',
        'hash',
        col('a', 'int'),
        'CREATE INDEX `idx_t_a` ON `t` (`a`) USING HASH;',
    ],
    [
        'mysql',
        'fulltext',
        col('a', 'text'),
        'CREATE FULLTEXT INDEX `idx_t_a` ON `t` (`a`);',
    ],
    [
        'mysql',
        'spatial',
        col('a', 'geometry'),
        'CREATE SPATIAL INDEX `idx_t_a` ON `t` (`a`);',
    ],
    [
        'mariadb',
        'hash',
        col('a', 'int'),
        'CREATE INDEX `idx_t_a` ON `t` (`a`) USING HASH;',
    ],
    [
        'mariadb',
        'fulltext',
        col('a', 'text'),
        'CREATE FULLTEXT INDEX `idx_t_a` ON `t` (`a`);',
    ],
    [
        'sql_server',
        'clustered',
        col('a', 'int'),
        'CREATE CLUSTERED INDEX [ix] ON [t] ([a]);',
    ],
    [
        'sql_server',
        'nonclustered',
        col('a', 'int'),
        'CREATE NONCLUSTERED INDEX [ix] ON [t] ([a]);',
    ],
    [
        'sql_server',
        'columnstore',
        col('a', 'int'),
        'CREATE NONCLUSTERED COLUMNSTORE INDEX [ix] ON [t] ([a]);',
    ],
    [
        'sql_server',
        'xml',
        col('a', 'xml'),
        'CREATE PRIMARY XML INDEX [ix] ON [t] ([a]);',
    ],
    [
        'oracle',
        'bitmap',
        col('a', 'number'),
        'CREATE BITMAP INDEX "t_ix" ON "t" ("a");',
    ],
];

describe('each database writes and reads its own index types', () => {
    for (const [db, method, column, statement] of OWN)
        it(`${db} ${method}`, () => {
            const design = build(
                db,
                [idColumn, column],
                [index('ix', ['a'], method)]
            );
            const { text } = exportSql(design, db);
            expect(text).toContain(statement);
            const back = importSql(text, db);
            expect(
                back.diagnostics.filter((d) => d.severity === 'error')
            ).toEqual([]);
            const keys = Object.values(back.design!.keys).filter((k) => !k.pk);
            expect(keys.map((k) => k.algorithm)).toEqual([method]);
        });

    it('the default type is not written out, in PostgreSQL, MySQL and Oracle', () => {
        for (const db of ['postgresql', 'mysql', 'oracle'] as const) {
            const { text } = exportSql(
                build(
                    db,
                    [idColumn, col('a', 'int')],
                    [index('ix', ['a'], 'btree')]
                ),
                db
            );
            expect(text, db).not.toMatch(/USING BTREE|BTREE/i);
        }
    });

    it('a unique index keeps its UNIQUE next to its type', () => {
        const sql = exportSql(
            build(
                'sql_server',
                [idColumn, col('a', 'int')],
                [index('ix', ['a'], 'nonclustered', true)]
            ),
            'sql_server'
        ).text;
        expect(sql).toContain('CREATE UNIQUE NONCLUSTERED INDEX [ix]');
    });

    it('SQL Server: a clustered index makes the primary key nonclustered', () => {
        const sql = exportSql(
            build(
                'sql_server',
                [idColumn, col('a', 'int')],
                [index('ix', ['a'], 'clustered')]
            ),
            'sql_server'
        ).text;
        expect(sql).toContain('PRIMARY KEY NONCLUSTERED ([id])');
        const without = exportSql(
            build(
                'sql_server',
                [idColumn, col('a', 'int')],
                [index('ix', ['a'], 'nonclustered')]
            ),
            'sql_server'
        ).text;
        expect(without).toContain('PRIMARY KEY ([id])');
    });

    it('MySQL: a fulltext index has no prefix length on a text column', () => {
        const sql = exportSql(
            build(
                'mysql',
                [idColumn, col('a', 'text')],
                [index('ix', ['a'], 'fulltext')]
            ),
            'mysql'
        ).text;
        expect(sql).toContain('(`a`)');
        expect(sql).not.toContain('(255)');
        const regular = exportSql(
            build(
                'mysql',
                [idColumn, col('a', 'text')],
                [index('ix', ['a'], 'btree')]
            ),
            'mysql'
        ).text;
        expect(regular).toContain('`a`(255)');
    });

    it('CREATE TABLE with a KEY ... USING HASH reads the type', () => {
        const r = importSql(
            'CREATE TABLE `t` (`id` int, `a` int, KEY `ix` (`a`) USING HASH);',
            'mysql'
        );
        expect(Object.values(r.design!.keys).map((k) => k.algorithm)).toContain(
            'hash'
        );
    });
});

/** Source database, its type, the column, and what every target writes for it. */
const CROSS: {
    from: DatabaseType;
    method: KeyMethod;
    column: ColumnSpec;
    keeps: Partial<Record<DatabaseType, string>>;
}[] = [
    {
        from: 'postgresql',
        method: 'hash',
        column: col('a', 'int'),
        keeps: { mysql: 'USING HASH;', mariadb: 'USING HASH;' },
    },
    {
        from: 'mysql',
        method: 'hash',
        column: col('a', 'int'),
        keeps: { postgresql: 'USING HASH (' },
    },
    { from: 'postgresql', method: 'gin', column: col('a', 'jsonb'), keeps: {} },
    { from: 'postgresql', method: 'brin', column: col('a', 'int'), keeps: {} },
    { from: 'mysql', method: 'fulltext', column: col('a', 'text'), keeps: {} },
    {
        from: 'sql_server',
        method: 'clustered',
        column: col('a', 'int'),
        keeps: {},
    },
    {
        from: 'sql_server',
        method: 'columnstore',
        column: col('a', 'int'),
        keeps: {},
    },
    { from: 'oracle', method: 'bitmap', column: col('a', 'number'), keeps: {} },
];

describe('an index type is kept where the target has it and becomes a regular index, with a note, where it does not', () => {
    const targets: DatabaseType[] = [
        'postgresql',
        'mysql',
        'mariadb',
        'sql_server',
        'sqlite',
        'oracle',
    ];
    for (const { from, method, column, keeps } of CROSS)
        for (const to of targets) {
            const sameFamily =
                from === to ||
                (from.startsWith('m') &&
                    to.startsWith('m') &&
                    from !== 'sql_server' &&
                    to !== 'sql_server');
            if (sameFamily) continue;
            it(`${from} ${method} to ${to}`, () => {
                const { text } = exportSql(
                    build(
                        from,
                        [idColumn, column],
                        [index('ix', ['a'], method)]
                    ),
                    to
                );
                const line = text
                    .split('\n')
                    .find((l) => /^CREATE .*INDEX /.test(l))!;
                const kept = keeps[to];
                if (kept) {
                    expect(line, text).toContain(kept);
                    expect(text).not.toContain(
                        `${method} index created as a regular index`
                    );
                } else {
                    // a regular index, and the note says what was given up
                    expect(line, text).toMatch(/^CREATE (UNIQUE )?INDEX /);
                    expect(text).toContain(
                        `${method} index created as a regular index`
                    );
                }
                // whatever is written reads back
                const back = importSql(text, to);
                expect(
                    back.diagnostics.filter((d) => d.severity === 'error'),
                    text
                ).toEqual([]);
            });
        }
});

describe('converting an index type', () => {
    const around = {
        kinds: ['int'] as const,
        hasPrimaryKey: true,
        mayBeClustered: true,
    };

    it('the plain index of every database is not remarked on', () => {
        for (const target of [
            'postgres',
            'mysql',
            'sqlserver',
            'sqlite',
            'oracle',
        ] as const) {
            expect(
                convertIndex(undefined, false, target, around).note
            ).toBeUndefined();
            expect(
                convertIndex('btree', true, target, around).head.includes(
                    'UNIQUE'
                )
            ).toBe(true);
        }
        expect(
            convertIndex('nonclustered', false, 'sqlserver', around).head
        ).toBe('NONCLUSTERED ');
    });

    it('a type that cannot be unique is made a regular unique index', () => {
        const r = convertIndex('bitmap', true, 'oracle', around);
        expect(r.regular).toBe(true);
        expect(r.head).toBe('UNIQUE ');
        expect(r.note).toContain('cannot be unique');
        expect(convertIndex('hash', true, 'postgres', around).note).toContain(
            'only a btree index can be unique'
        );
        expect(convertIndex('hash', true, 'mysql', around).tail).toBe(
            ' USING HASH'
        );
    });

    it('a second clustered index in SQL Server is a regular one', () => {
        const second = convertIndex('clustered', false, 'sqlserver', {
            ...around,
            mayBeClustered: false,
        });
        expect(second.regular).toBe(true);
        expect(second.note).toContain('only one clustered index');
    });

    it('an xml index needs one xml column and a primary key', () => {
        expect(
            convertIndex('xml', false, 'sqlserver', {
                ...around,
                kinds: ['xml'],
            }).head
        ).toBe('PRIMARY XML ');
        expect(convertIndex('xml', false, 'sqlserver', around).regular).toBe(
            true
        );
        expect(
            convertIndex('xml', false, 'sqlserver', {
                kinds: ['xml'],
                hasPrimaryKey: false,
                mayBeClustered: true,
            }).note
        ).toContain('needs a primary key');
    });

    it('PostgreSQL: a hash index takes one column', () => {
        expect(
            convertIndex('hash', false, 'postgres', {
                ...around,
                kinds: ['int', 'int'],
            }).regular
        ).toBe(true);
        expect(convertIndex('gin', false, 'postgres', around).between).toBe(
            ' USING GIN'
        );
    });
});

describe('index types in imported database metadata', () => {
    const meta = (type: string): DatabaseMetadata => ({
        database_name: 'd',
        version: 'x',
        tables: [{ schema: 'dbo', table: 't' }],
        views: [],
        columns: [
            {
                schema: 'dbo',
                table: 't',
                name: 'id',
                type: 'int',
                ordinal_position: 1,
                nullable: false,
            },
            {
                schema: 'dbo',
                table: 't',
                name: 'a',
                type: 'int',
                ordinal_position: 2,
                nullable: true,
            },
        ],
        pk_info: [
            { schema: 'dbo', table: 't', column: 'id', pk_def: 'PRIMARY KEY' },
        ],
        fk_info: [],
        indexes: [
            {
                schema: 'dbo',
                table: 't',
                name: 'ix',
                column: 'a',
                index_type: type,
                unique: false,
                direction: 'asc',
                column_position: 1,
            },
        ],
    });
    it.each([
        ['nonclustered', 'nonclustered'],
        ['clustered', 'clustered'],
        ['nonclustered columnstore', 'columnstore'],
        ['clustered columnstore', 'columnstore'],
        ['nonclustered hash', 'nonclustered'],
        ['xml', 'xml'],
        ['bitmap', 'bitmap'],
        ['fulltext', 'fulltext'],
        ['rtree', 'spatial'],
        ['btree', 'btree'],
    ])('%s becomes %s', (given, kept) => {
        const r = loadFromDatabaseMetadata({
            databaseType: 'sql_server',
            databaseMetadata: meta(given),
        });
        const keys = Object.values(r.design.keys).filter((k) => !k.pk);
        expect(keys.map((k) => k.algorithm)).toEqual([kept]);
    });
});
