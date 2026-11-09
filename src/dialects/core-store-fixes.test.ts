import { describe, expect, it } from 'vitest';
import { listOf } from '@/core/model/collection';
import type { DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import { seededRandom } from '@/core/model/ids';
import { exportSql } from '@/formats/sql/export-sql';
import { DesignBuilder } from '@/formats/shared/design-builder';
import type { ColumnSpec, TableSpec } from '@/formats/shared/design-builder';

const NOW = Date.UTC(2026, 10, 7);
const col = (name: string, typeName = 'int', o: Partial<ColumnSpec> = {}) =>
    ({ name, typeName, nullable: true, ...o }) as ColumnSpec;
const table = (
    name: string,
    columns: ColumnSpec[],
    o: Partial<TableSpec> = {}
): TableSpec => ({ name, columns, indexes: [], checks: [], ...o });

function build(
    type: DatabaseType,
    tables: TableSpec[],
    links: [string, string, string, string, string][] = [],
    types: { name: string; schema?: string; values: string[] }[] = []
): Design {
    const b = new DesignBuilder({
        databaseType: type,
        name: 't',
        now: NOW,
        random: seededRandom(3),
        sort: false,
    });
    for (const t of types) b.addUserType({ ...t, kind: 'enum' });
    for (const t of tables) b.addTable(t);
    for (const [name, from, fc, to, tc] of links)
        b.addLink({
            name,
            from: { table: from, column: fc },
            to: { table: to, column: tc },
        });
    return b.build();
}

const usersAndOrders = (type: DatabaseType) =>
    build(
        type,
        [
            table('users', [
                col('id', 'int', { primary: true, nullable: false }),
            ]),
            table('orders', [
                col('id', 'int', { primary: true, nullable: false }),
                col('user_id'),
            ]),
            table('invoices', [
                col('id', 'int', { primary: true, nullable: false }),
                col('user_id'),
            ]),
        ],
        [
            ['users_id_fk', 'users', 'id', 'orders', 'user_id'],
            ['users_id_fk', 'users', 'id', 'invoices', 'user_id'],
        ]
    );

const names = (text: string, re: RegExp) =>
    [...text.matchAll(re)].map((m) => m[1]);

describe('review core-store 2/9: constraint and index names are unique', () => {
    it('SQL Server FK names never repeat in a schema', () => {
        const text = exportSql(usersAndOrders('sql_server'), 'sql_server').text;
        const found = names(text, /ADD CONSTRAINT \[([^\]]+)\]/g);
        expect(found).toHaveLength(2);
        expect(new Set(found.map((n) => n.toLowerCase())).size).toBe(2);
    });
    it('the converter dedupes FK names for MySQL and SQL Server', () => {
        for (const target of ['mysql', 'sql_server', 'postgresql'] as const) {
            const text = exportSql(usersAndOrders('postgresql'), target).text;
            const found = names(text, /ADD CONSTRAINT [`"[]([^`"\]]+)[`"\]]/g);
            expect(found).toHaveLength(2);
            expect(new Set(found).size).toBe(2);
        }
    });
    it('the MySQL writer gives two FKs on one column of different tables distinct names', () => {
        const d = build(
            'mysql',
            [
                table('a', [
                    col('id', 'int', { primary: true, nullable: false }),
                ]),
                table('b', [
                    col('id', 'int', { primary: true, nullable: false }),
                ]),
                table('orders', [col('a'), col('b')]),
                table('orders2', [col('a')]),
            ],
            [
                ['x', 'a', 'id', 'orders', 'a'],
                ['y', 'b', 'id', 'orders', 'a'],
            ]
        );
        const found = names(
            exportSql(d, 'mysql').text,
            /ADD CONSTRAINT `([^`]+)`/g
        );
        expect(found).toHaveLength(2);
        expect(new Set(found).size).toBe(2);
    });
    it('long MySQL index names fit in 64 characters', () => {
        const long = 'c'.repeat(40);
        const d = build('mysql', [
            table('t'.repeat(30), [col(long), col(`${long}2`)], {
                indexes: [
                    { name: 'i', unique: false, columns: [long, `${long}2`] },
                ],
            }),
        ]);
        const found = names(
            exportSql(d, 'mysql').text,
            /CREATE (?:UNIQUE )?INDEX `([^`]+)`/g
        );
        expect(found).toHaveLength(1);
        expect(found[0].length).toBeLessThanOrEqual(64);
    });
    it('MySQL indexes with the same columns and different method stay distinct', () => {
        const d = build('mysql', [
            table('t', [col('a')], {
                indexes: [
                    { name: 'i1', unique: false, columns: ['a'] },
                    {
                        name: 'i2',
                        unique: false,
                        columns: ['a'],
                        method: 'hash',
                    },
                ],
            }),
        ]);
        const found = names(exportSql(d, 'mysql').text, /INDEX `([^`]+)`/g);
        expect(new Set(found).size).toBe(2);
    });
    it('SQLite index names are unique and none is skipped', () => {
        const idx = 'x'.repeat(70);
        const d = build('sqlite', [
            table('t', [col('a')], {
                indexes: [
                    { name: `${idx}1`, unique: false, columns: ['a'] },
                    { name: `${idx}2`, unique: false, columns: ['a'] },
                ],
            }),
        ]);
        const found = names(
            exportSql(d, 'sqlite').text,
            /INDEX IF NOT EXISTS "([^"]+)"/g
        );
        expect(found).toHaveLength(2);
        expect(new Set(found).size).toBe(2);
    });
    it('PostgreSQL FK names that clip to the same text stay distinct', () => {
        const pad = 'p'.repeat(40);
        const d = build(
            'postgresql',
            [
                table('r', [
                    col('id', 'int', { primary: true, nullable: false }),
                ]),
                table(pad, [col(`${pad}a`), col(`${pad}b`)]),
            ],
            [
                ['x', 'r', 'id', pad, `${pad}a`],
                ['y', 'r', 'id', pad, `${pad}b`],
            ]
        );
        const found = names(
            exportSql(d, 'postgresql').text,
            /ADD CONSTRAINT "([^"]+)"/g
        );
        expect(found).toHaveLength(2);
        expect(new Set(found).size).toBe(2);
        for (const n of found) expect(n.length).toBeLessThanOrEqual(60);
    });
    it('PostgreSQL index names are unique inside a schema', () => {
        const d = build('postgresql', [
            table('t', [col('a')], {
                indexes: [{ name: 'same', unique: false, columns: ['a'] }],
            }),
            table('t_same', [col('a')], {
                indexes: [{ name: 'x', unique: false, columns: ['a'] }],
            }),
        ]);
        const found = names(
            exportSql(d, 'postgresql').text,
            /INDEX "([^"]+)"/g
        );
        expect(new Set(found).size).toBe(found.length);
    });
});

describe('review core-store 5: MySQL string literals', () => {
    it('doubles backslashes in comments and defaults', () => {
        const d = build('mysql', [
            table(
                't',
                [
                    col('a', 'varchar', {
                        comment: 'path C:\\',
                        default: 'a\\b',
                    }),
                ],
                { comment: 'T:\\' }
            ),
        ]);
        const text = exportSql(d, 'mysql').text;
        expect(text).toContain("COMMENT 'path C:\\\\'");
        expect(text).toContain("DEFAULT 'a\\\\b'");
        expect(text).toContain("COMMENT='T:\\\\'");
    });
});

describe('review core-store 6: text in comments cannot leave the comment', () => {
    it('comments out every line of a multi-line CHECK that is not created', () => {
        const d = build('postgresql', [
            table('t', [col('id')], {
                checks: ['id IN (\n  SELECT 1\n)'],
            }),
        ]);
        const text = exportSql(d, 'mysql').text;
        for (const line of text.split('\n'))
            if (/SELECT 1/.test(line))
                expect(line.trimStart().startsWith('--')).toBe(true);
    });
    it('a schema name with a newline cannot start a statement', () => {
        for (const type of ['postgresql', 'sql_server', 'sqlite'] as const) {
            const d = build(
                type,
                [
                    table('t', [
                        col('id', 'int', { primary: true, nullable: false }),
                    ]),
                    table('u', [col('id', 'int'), col('t_id')]),
                ],
                [['f', 't', 'id', 'u', 't_id']]
            );
            for (const e of listOf(d.entities)) e.schema = 'a\nDROP TABLE x;';
            const text = exportSql(d, type).text;
            expect(text).toContain(
                type === 'sqlite'
                    ? '-- Original schema: a DROP TABLE x;'
                    : '-- Schema: a DROP TABLE x;'
            );
        }
    });
});

describe('review core-store 7: PostgreSQL user types', () => {
    it('quotes and qualifies a type CREATE TYPE had to quote', () => {
        const d = build(
            'postgresql',
            [table('t', [col('id', 'Mood'), col('b', 'Other')])],
            [],
            [
                { name: 'Mood', values: ['a'] },
                { name: 'Other', schema: 'app', values: ['x'] },
            ]
        );
        const text = exportSql(d, 'postgresql').text;
        expect(text).toContain('CREATE TYPE "Mood"');
        expect(text).toContain('"id" "Mood"');
        expect(text).toContain('"b" "app"."Other"');
    });
});

describe('pasted text with a very long run of blank lines', () => {
    const blank = '\n'.repeat(80_000);

    it('is repaired and checked in well under a second', async () => {
        const { fixPostgres } = await import('./postgresql/read');
        const start = Date.now();
        fixPostgres(`DECIMAL(1,${blank}x`);
        expect(Date.now() - start).toBeLessThan(500);
        expect(fixPostgres('DECIMAL(10,\n  2)')).toBe('DECIMAL(10, 2)');
    });

    it('is classified by the paste detector in well under a second', async () => {
        const { methodForPaste } =
            await import('@/features/import/import-method');
        const start = Date.now();
        expect(methodForPaste(`${blank}x`)).toBeUndefined();
        expect(Date.now() - start).toBeLessThan(500);
        expect(methodForPaste('\n\n  Table users {\n id int\n}')).toBe('dbml');
    });
});
