import { describe, expect, it } from 'vitest';
import type { DatabaseEdition, DatabaseType } from '@/core/model/database';
import { editionsFor } from '@/core/model/database';
import { loadFromDatabaseMetadata } from '@/formats/metadata/load';
import {
    parseMetadataText,
    repairMetadataText,
} from '@/formats/metadata/repair-text';
import { metadataScriptFor } from '../metadata-scripts';

// Each script is checked against a hand-written result of the shape that
// the query returns; no live database is available to run them against.

const KEYS = [
    'database_name',
    'version',
    'tables',
    'views',
    'columns',
    'pk_info',
    'fk_info',
    'indexes',
];

const cases: [DatabaseType, DatabaseEdition | undefined, string[]][] = [
    [
        'postgresql',
        undefined,
        ['pg_class', 'pg_constraint', 'pg_enum', 'pg_attrdef'],
    ],
    ['postgresql', 'supabase', ["'auth'", "'storage'", 'pg_class']],
    ['postgresql', 'timescale', ['^_timescaledb', 'pg_class']],
    [
        'mysql',
        undefined,
        [
            'information_schema',
            'KEY_COLUMN_USAGE',
            'CHECK_CONSTRAINTS',
            'group_concat_max_len',
        ],
    ],
    [
        'mysql',
        'mysql_5_7',
        ['information_schema', 'KEY_COLUMN_USAGE', 'group_concat_max_len'],
    ],
    ['mariadb', undefined, ['information_schema', 'STATISTICS']],
    [
        'sql_server',
        undefined,
        [
            'sys.tables',
            'sys.foreign_key_columns',
            'FOR JSON PATH',
            'sys.check_constraints',
        ],
    ],
    [
        'sql_server',
        'sql_server_2016_and_below',
        [
            'sys.tables',
            'sys.foreign_key_columns',
            'FOR XML PATH',
            'sys.check_constraints',
        ],
    ],
];

describe('metadata scripts per database and edition (IMP-056, IMP-003)', () => {
    it.each(cases)('%s %s is a non-empty script', (type, edition, tokens) => {
        const script = metadataScriptFor(type, edition);
        expect(script).toBeTruthy();
        expect(script).toContain('metadata_json_to_import');
        for (const token of tokens) expect(script).toContain(token);
        for (const key of KEYS) expect(script).toContain(key);
    });

    it('every listed edition has a script of its own', () => {
        for (const type of [
            'postgresql',
            'mysql',
            'sql_server',
            'sqlite',
        ] as const)
            for (const edition of editionsFor(type))
                expect(metadataScriptFor(type, edition)).not.toBe(
                    metadataScriptFor(type)
                );
    });

    it('the pieces that differ by edition really differ', () => {
        expect(
            metadataScriptFor('sql_server', 'sql_server_2016_and_below')
        ).not.toContain('FOR JSON');
        expect(metadataScriptFor('mysql', 'mysql_5_7')).not.toContain(
            'CHECK_CONSTRAINTS'
        );
        expect(metadataScriptFor('postgresql')).toContain('indnkeyatts');
        expect(metadataScriptFor('postgresql')).not.toContain('auth');
    });
});

function run(
    type: DatabaseType,
    result: unknown,
    shape: 'plain' | 'cell' = 'plain'
) {
    const text =
        shape === 'cell'
            ? JSON.stringify([
                  { metadata_json_to_import: JSON.stringify(result) },
              ])
            : JSON.stringify(result);
    const parsed = parseMetadataText(repairMetadataText(text));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('not metadata');
    return loadFromDatabaseMetadata({
        databaseType: type,
        databaseMetadata: parsed.metadata,
    });
}

const column = (
    schema: string,
    table: string,
    name: string,
    type: string,
    pos: number,
    extra: Record<string, unknown> = {}
) => ({
    schema,
    table,
    name,
    type,
    ordinal_position: pos,
    nullable: true,
    ...extra,
});

function rulesOf(
    design: { rules: Record<string, { expression: string }> },
    entity: { ruleIds: string[] }
) {
    return entity.ruleIds.map((id) => design.rules[id].expression);
}

function describeResult(type: DatabaseType, result: unknown) {
    const { design } = run(type, result);
    const byName = Object.values(design.entities.byId);
    const shop = byName.find((e) => e.name === 'orders')!;
    const customers = byName.find((e) => e.name === 'customers')!;
    return { design, shop, customers };
}

describe('hand-written results import (IMP-059)', () => {
    it('PostgreSQL: schemas, arrays, enums, serial, views, checks', () => {
        const result = {
            database_name: 'shop',
            version: 'PostgreSQL 16.3',
            tables: [
                {
                    schema: 'sales',
                    table: 'customers',
                    rows: 3,
                    type: 'BASE TABLE',
                    comment: 'People',
                },
                {
                    schema: 'sales',
                    table: 'orders',
                    rows: 0,
                    type: 'BASE TABLE',
                },
            ],
            views: [
                {
                    schema: 'sales',
                    view_name: 'big_orders',
                    view_definition: btoa(
                        'CREATE VIEW sales.big_orders AS SELECT * FROM sales.orders'
                    ),
                },
            ],
            columns: [
                column('sales', 'customers', 'id', 'integer', 1, {
                    nullable: false,
                    default: "nextval('sales.customers_id_seq'::regclass)",
                    is_identity: true,
                }),
                column('sales', 'customers', 'email', 'character varying', 2, {
                    nullable: false,
                    character_maximum_length: '120',
                }),
                column('sales', 'customers', 'tags', 'text', 3, {
                    is_array: true,
                }),
                column('sales', 'orders', 'id', 'integer', 1, {
                    nullable: false,
                }),
                column('sales', 'orders', 'customer_id', 'integer', 2),
                column('sales', 'orders', 'total', 'numeric', 3, {
                    precision: { precision: 10, scale: 2 },
                }),
                column('sales', 'orders', 'state', 'order_state', 4),
                column('sales', 'big_orders', 'id', 'integer', 1),
            ],
            pk_info: [
                {
                    schema: 'sales',
                    table: 'customers',
                    column: 'id',
                    pk_def: 'PRIMARY KEY (id)',
                },
                {
                    schema: 'sales',
                    table: 'orders',
                    column: 'id',
                    pk_def: 'PRIMARY KEY (id)',
                },
            ],
            fk_info: [
                {
                    schema: 'sales',
                    table: 'orders',
                    column: 'customer_id',
                    foreign_key_name: 'orders_customer_fk',
                    reference_schema: 'sales',
                    reference_table: 'customers',
                    reference_column: 'id',
                    fk_def: 'FOREIGN KEY (customer_id) REFERENCES sales.customers(id)',
                },
            ],
            indexes: [
                {
                    schema: 'sales',
                    table: 'customers',
                    name: 'customers_pkey',
                    column: 'id',
                    index_type: 'btree',
                    unique: true,
                    direction: 'asc',
                    column_position: 1,
                },
                {
                    schema: 'sales',
                    table: 'customers',
                    name: 'customers_email_key',
                    column: 'email',
                    index_type: 'btree',
                    unique: true,
                    direction: 'asc',
                    column_position: 1,
                },
            ],
            check_constraints: [
                {
                    schema: 'sales',
                    table: 'orders',
                    expression: '(total >= 0)',
                },
            ],
            custom_types: [
                {
                    schema: 'sales',
                    type: 'order_state',
                    kind: 'enum',
                    values: ['new', 'paid'],
                },
            ],
        };
        const { design, shop, customers } = describeResult(
            'postgresql',
            result
        );
        expect(design.links.order).toHaveLength(1);
        expect(design.entities.order).toHaveLength(3);
        const cols = customers.columnIds.map((id) => design.columns[id]);
        expect(cols.map((c) => c.name)).toEqual(['id', 'email', 'tags']);
        expect(cols[1]).toMatchObject({
            type: { name: 'varchar' },
            length: 120,
            nullable: false,
        });
        expect(cols[2].isArray).toBe(true);
        expect(cols[0].increment).toBe(true);
        expect(design.columns[shop.columnIds[2]]).toMatchObject({
            precision: 10,
            scale: 2,
        });
        expect(rulesOf(design, shop)).toEqual(['(total >= 0)']);
        expect(JSON.stringify(design)).toContain('order_state');
    });

    it('MySQL and MariaDB: no schema, auto increment, engine, keys', () => {
        const result = {
            database_name: 'shop',
            version: '8.0.36',
            tables: [
                {
                    schema: '',
                    table: 'customers',
                    rows: 2,
                    type: 'BASE TABLE',
                    engine: 'InnoDB',
                    collation: 'utf8mb4_0900_ai_ci',
                },
                {
                    schema: '',
                    table: 'orders',
                    rows: 0,
                    type: 'BASE TABLE',
                    engine: 'InnoDB',
                },
            ],
            views: [],
            columns: [
                column('', 'customers', 'id', 'int', 1, {
                    nullable: 0,
                    is_identity: true,
                }),
                column('', 'customers', 'name', 'varchar', 2, {
                    nullable: 0,
                    character_maximum_length: '80',
                }),
                column('', 'orders', 'id', 'int', 1, { nullable: 0 }),
                column('', 'orders', 'customer_id', 'int', 2, { nullable: 0 }),
                column('', 'orders', 'amount', 'decimal', 3, {
                    precision: { precision: 8, scale: 2 },
                    default: '0.00',
                }),
            ],
            pk_info: [
                {
                    schema: '',
                    table: 'customers',
                    column: 'id',
                    pk_def: 'PRIMARY KEY',
                },
                {
                    schema: '',
                    table: 'orders',
                    column: 'id',
                    pk_def: 'PRIMARY KEY',
                },
            ],
            fk_info: [
                {
                    schema: '',
                    table: 'orders',
                    column: 'customer_id',
                    foreign_key_name: 'fk_orders_customer',
                    reference_schema: '',
                    reference_table: 'customers',
                    reference_column: 'id',
                    fk_def: 'FOREIGN KEY',
                },
            ],
            indexes: [
                {
                    schema: '',
                    table: 'customers',
                    name: 'PRIMARY',
                    column: 'id',
                    index_type: 'btree',
                    unique: 1,
                    direction: 'asc',
                    column_position: 1,
                },
                {
                    schema: '',
                    table: 'orders',
                    name: 'fk_orders_customer',
                    column: 'customer_id',
                    index_type: 'btree',
                    unique: 0,
                    direction: 'asc',
                    column_position: 1,
                },
            ],
        };
        for (const type of ['mysql', 'mariadb'] as const) {
            const { design, shop, customers } = describeResult(type, result);
            expect(design.links.order).toHaveLength(1);
            expect(customers.schema).toBeUndefined();
            expect(design.columns[customers.columnIds[0]].increment).toBe(true);
            expect(design.columns[shop.columnIds[2]]).toMatchObject({
                precision: 8,
                scale: 2,
            });
            expect(design.columns[customers.columnIds[1]]).toMatchObject({
                length: 80,
                nullable: false,
            });
        }
    });

    it('SQL Server: dbo schema, max length, UTF-16 view, descending index', () => {
        const utf16 = (text: string) => {
            let bin = '';
            for (const ch of text) {
                const code = ch.charCodeAt(0);
                bin += String.fromCharCode(code & 255, code >> 8);
            }
            return btoa(bin);
        };
        const result = {
            database_name: 'Shop',
            version: 'Microsoft SQL Server 2022',
            tables: [
                { schema: 'dbo', table: 'customers', type: 'BASE TABLE' },
                { schema: 'dbo', table: 'orders', type: 'BASE TABLE' },
            ],
            views: [
                {
                    schema: 'dbo',
                    view_name: 'v_orders',
                    view_definition: utf16(
                        'CREATE VIEW dbo.v_orders AS SELECT id FROM dbo.orders'
                    ),
                },
            ],
            columns: [
                column('dbo', 'customers', 'id', 'int', 1, {
                    nullable: false,
                    is_identity: true,
                }),
                column('dbo', 'customers', 'bio', 'nvarchar', 2, {
                    character_maximum_length: 'max',
                }),
                column('dbo', 'orders', 'id', 'int', 1, { nullable: false }),
                column('dbo', 'orders', 'customer_id', 'int', 2),
                column('dbo', 'v_orders', 'id', 'int', 1),
            ],
            pk_info: [
                {
                    schema: 'dbo',
                    table: 'customers',
                    column: 'id',
                    pk_def: 'PRIMARY KEY',
                },
                {
                    schema: 'dbo',
                    table: 'orders',
                    column: 'id',
                    pk_def: 'PRIMARY KEY',
                },
            ],
            fk_info: [
                {
                    schema: 'dbo',
                    table: 'orders',
                    column: 'customer_id',
                    foreign_key_name: 'FK_orders_customers',
                    reference_schema: 'dbo',
                    reference_table: 'customers',
                    reference_column: 'id',
                    fk_def: 'FOREIGN KEY',
                },
            ],
            indexes: [
                {
                    schema: 'dbo',
                    table: 'orders',
                    name: 'IX_orders_customer',
                    column: 'customer_id',
                    index_type: 'nonclustered',
                    unique: false,
                    direction: 'desc',
                    column_position: 1,
                },
            ],
            check_constraints: [
                { schema: 'dbo', table: 'orders', expression: '([id]>(0))' },
            ],
        };
        const { design, shop, customers } = describeResult(
            'sql_server',
            result
        );
        expect(design.links.order).toHaveLength(1);
        expect(design.columns[customers.columnIds[1]].length).toBe('max');
        expect(rulesOf(design, shop)).toEqual(['([id]>(0))']);
        expect(design.entities.order).toHaveLength(3);
        expect(shop.keyIds.length).toBeGreaterThan(0);
    });

    it('also accepts the cell as a client pastes it', () => {
        const { design } = run(
            'mysql',
            {
                database_name: 'd',
                version: '8',
                tables: [],
                views: [],
                columns: [],
                pk_info: [],
                fk_info: [],
                indexes: [],
            },
            'cell'
        );
        expect(design.entities.order).toHaveLength(0);
    });
});

// Found by running the scripts on live servers (PostgreSQL 16 and 18, MySQL
// 8.4 and 5.7, MariaDB 11, CockroachDB).
describe('fixes found on live databases', () => {
    it('PostgreSQL reads an index column by attribute number, not through pg_get_indexdef', () => {
        // pg_get_indexdef quotes "Mixed Col"; the column list has the bare name
        for (const edition of [undefined, 'supabase', 'timescale'] as const) {
            const script = metadataScriptFor('postgresql', edition)!;
            expect(script).toContain('i.indkey[g.k - 1]');
        }
    });

    it('PostgreSQL does not call a partial unique index unique', () => {
        // the index is unique and carries its predicate: the import decides
        expect(metadataScriptFor('postgresql')).toContain(
            `'where', pg_get_expr(i.indpred, i.indrelid)`
        );
        const { design } = run('postgresql', {
            database_name: 'd',
            version: 'PostgreSQL 16',
            tables: [
                { schema: 'public', table: 't', rows: 0, type: 'BASE TABLE' },
            ],
            views: [],
            columns: [column('public', 't', 'email', 'text', 1)],
            pk_info: [],
            fk_info: [],
            indexes: [
                {
                    schema: 'public',
                    table: 't',
                    name: 't_active_email',
                    column: 'email',
                    index_type: 'btree',
                    unique: false,
                    direction: 'asc',
                    column_position: 1,
                },
            ],
        });
        const col = Object.values(design.columns).find(
            (c) => c.name === 'email'
        )!;
        expect(col.unique).toBe(false);
    });

    it('PostgreSQL and MySQL scripts report generated columns, domains and partial indexes', () => {
        const pg = metadataScriptFor('postgresql')!;
        expect(pg).toContain(
            `'generated', CASE WHEN a.attgenerated IN ('s', 'v')`
        );
        expect(pg).toContain(
            `'domain', CASE WHEN t.typtype = 'd' THEN t.typname END`
        );
        expect(pg).toContain(
            `format_type(CASE WHEN t.typtype = 'd' THEN t.typbasetype`
        );
        // a generated column keeps no default of its own
        expect(pg).toContain(
            `CASE WHEN a.attgenerated IN ('s', 'v') THEN NULL ELSE`
        );
        for (const type of ['mysql', 'mariadb'] as const) {
            const my = metadataScriptFor(type)!;
            expect(my).toContain('"generated":');
            expect(my).toContain('GENERATION_EXPRESSION');
            expect(my).toContain(`EXTRA LIKE '%STORED%'`);
        }
        expect(metadataScriptFor('mysql', 'mysql_5_7')).toContain(
            'GENERATION_EXPRESSION'
        );
    });

    it('the SQL Server script reads the descending flag from its real column name', () => {
        const ms = metadataScriptFor('sql_server')!;
        expect(ms).toContain('ic.is_descending_key');
        expect(ms).not.toMatch(/ic\.is_descending\b(?!_)/);
    });

    it('an index on an expression is reported, not dropped silently', () => {
        const { diagnostics, design } = run('postgresql', {
            database_name: 'd',
            version: 'PostgreSQL 16',
            tables: [
                { schema: 'public', table: 't', rows: 0, type: 'BASE TABLE' },
            ],
            views: [],
            columns: [column('public', 't', 'email', 'text', 1)],
            pk_info: [],
            fk_info: [],
            indexes: [
                {
                    schema: 'public',
                    table: 't',
                    name: 't_lower',
                    column: 'lower(email::text)',
                    index_type: 'btree',
                    unique: false,
                    direction: 'asc',
                    column_position: 1,
                },
            ],
        });
        expect(Object.keys(design.keys)).toHaveLength(0);
        expect(diagnostics.some((d) => d.message.includes('t_lower'))).toBe(
            true
        );
    });

    it('MySQL joins every piece as utf8mb4_bin so any client character set works', () => {
        for (const edition of [undefined, 'mysql_5_7'] as const) {
            const script = metadataScriptFor('mysql', edition)!;
            expect(script).toContain(
                'CONVERT(CAST(c.ORDINAL_POSITION AS CHAR) USING utf8mb4) COLLATE utf8mb4_bin'
            );
            expect(script).toContain(
                "CONVERT(IF(c.IS_NULLABLE = 'YES', 'true', 'false') USING utf8mb4) COLLATE utf8mb4_bin"
            );
        }
    });

    it('every script says which index is the primary key (CLI-039)', () => {
        expect(metadataScriptFor('postgresql')).toContain(
            "'primary', i.indisprimary"
        );
        expect(metadataScriptFor('mysql')).toContain(
            "s.INDEX_NAME = 'PRIMARY'"
        );
        expect(metadataScriptFor('sql_server')).toContain('i.is_primary_key');
        expect(metadataScriptFor('oracle')).toContain(
            "pk.constraint_type = 'P'"
        );
        expect(metadataScriptFor('sqlite')).toContain("i.origin = 'pk'");
        // the edition variants are built from the same text
        for (const [type, edition, needle] of [
            ['postgresql', 'supabase', "'primary', i.indisprimary"],
            ['postgresql', 'timescale', "'primary', i.indisprimary"],
            ['mysql', 'mysql_5_7', "s.INDEX_NAME = 'PRIMARY'"],
            ['sql_server', 'sql_server_2016_and_below', 'i.is_primary_key'],
            ['sqlite', 'cloudflare_d1', "i.origin = 'pk'"],
        ] as const)
            expect(metadataScriptFor(type, edition)).toContain(needle);
    });

    it('MySQL quotes a string default, keeps numbers and expressions, drops view defaults', () => {
        const script = metadataScriptFor('mysql')!;
        expect(script).toContain('QUOTE(c.COLUMN_DEFAULT)');
        expect(script).toContain('DEFAULT\\_GENERATED');
        expect(script).toContain("LIKE '%MariaDB%'");
        expect(script).toContain('FROM information_schema.VIEWS w');
    });

    it('MySQL strips the escaped quotes and character set introducers of a check clause', () => {
        const script = metadataScriptFor('mysql')!;
        expect(script).toContain('CONCAT(CHAR(92), CHAR(39))');
        expect(script).toContain("CONCAT('_utf8mb4', CHAR(39))");
    });
});
