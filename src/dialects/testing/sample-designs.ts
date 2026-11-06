import type { DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import { seededRandom } from '@/core/model/ids';
import { DesignBuilder } from '@/formats/shared/design-builder';
import type { ColumnSpec, TableSpec } from '@/formats/shared/design-builder';

const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);

type Opts = Partial<ColumnSpec>;
const col = (name: string, typeName: string, o: Opts = {}): ColumnSpec => ({
    name,
    typeName,
    nullable: true,
    ...o,
});

function make(
    type: DatabaseType,
    tables: TableSpec[],
    links: [string, string, string, string, string][] = [],
    types: { name: string; values: string[] }[] = []
): Design {
    const b = new DesignBuilder({
        databaseType: type,
        name: 'sample',
        now: NOW,
        random: seededRandom(5),
        sort: false,
    });
    for (const t of types)
        b.addUserType({ name: t.name, kind: 'enum', values: t.values });
    for (const t of tables) b.addTable(t);
    for (const [name, from, fromColumn, to, toColumn] of links)
        b.addLink({
            name,
            from: { table: from, column: fromColumn },
            to: { table: to, column: toColumn },
        });
    return b.build();
}

const now: Record<string, string> = {
    postgresql: 'now()',
    mysql: 'CURRENT_TIMESTAMP',
    sql_server: 'getdate()',
    sqlite: 'CURRENT_TIMESTAMP',
};
const names: Record<string, { int: string; ts: string; dec: string }> = {
    postgresql: { int: 'integer', ts: 'timestamp', dec: 'numeric' },
    mysql: { int: 'int', ts: 'timestamp', dec: 'decimal' },
    sql_server: { int: 'int', ts: 'datetime2', dec: 'decimal' },
    sqlite: { int: 'integer', ts: 'timestamp', dec: 'decimal' },
};

/** Model S1 "customers and orders" (spec 10.1). */
export function sampleS1(
    type: 'postgresql' | 'mysql' | 'sql_server' | 'sqlite'
): Design {
    const t = names[type];
    return make(
        type,
        [
            {
                name: 'customers',
                columns: [
                    col('id', t.int, {
                        primary: true,
                        nullable: false,
                        numbered: true,
                    }),
                    col('email', 'varchar', {
                        length: 120,
                        nullable: false,
                        unique: true,
                    }),
                    col('full_name', 'varchar', { length: 80 }),
                    col('created_at', t.ts, {
                        nullable: false,
                        default: now[type],
                    }),
                ],
                indexes: [],
                checks: [],
            },
            {
                name: 'orders',
                columns: [
                    col('id', t.int, {
                        primary: true,
                        nullable: false,
                        numbered: true,
                    }),
                    col('customer_id', t.int, { nullable: false }),
                    col('total', t.dec, {
                        precision: 10,
                        scale: 2,
                        nullable: false,
                        default: '0',
                    }),
                ],
                indexes: [
                    {
                        name: 'idx_orders_customer',
                        unique: false,
                        columns: ['customer_id'],
                    },
                ],
                checks: [],
            },
        ],
        [['fk_orders_customers', 'customers', 'id', 'orders', 'customer_id']]
    );
}

/** Model S2 "courses and enrolments" (spec 10.2). */
export function sampleS2(
    type: 'postgresql' | 'mysql' | 'sql_server' | 'sqlite'
): Design {
    const t = names[type];
    const schema =
        type === 'postgresql' || type === 'sql_server' ? 'school' : undefined;
    const d = make(
        type,
        [
            {
                name: 'courses',
                schema,
                comment: 'Course catalogue',
                columns: [
                    col('code', 'varchar', {
                        length: 10,
                        primary: true,
                        nullable: false,
                    }),
                    col('title', 'varchar', {
                        length: 100,
                        nullable: false,
                        comment: 'Display name',
                    }),
                    col('credits', 'smallint', {
                        nullable: false,
                        default: '3',
                    }),
                ],
                indexes: [],
                checks: ['credits > 0'],
            },
            {
                name: 'enrolments',
                schema,
                columns: [
                    col('student_id', t.int, {
                        primary: true,
                        nullable: false,
                    }),
                    col('course_code', 'varchar', {
                        length: 10,
                        primary: true,
                        nullable: false,
                    }),
                    col('grade', 'char', { length: 1 }),
                ],
                indexes: [
                    {
                        name: 'idx_enrol_course',
                        unique: false,
                        columns: ['course_code', 'grade'],
                    },
                ],
                checks: [],
            },
        ],
        []
    );
    return linkOf(
        d,
        'fk_enrol_course',
        'courses',
        'code',
        'enrolments',
        'course_code'
    );
}

function linkOf(
    design: Design,
    name: string,
    a: string,
    ac: string,
    b: string,
    bc: string
): Design {
    const ent = (n: string) =>
        design.entities.order
            .map((id) => design.entities.byId[id])
            .find((e) => e.name === n)!;
    const colOf = (e: ReturnType<typeof ent>, n: string) =>
        e.columnIds.map((id) => design.columns[id]).find((c) => c.name === n)!;
    const ea = ent(a);
    const eb = ent(b);
    const id = 'link-' + name;
    return {
        ...design,
        links: {
            byId: {
                [id]: {
                    id,
                    name,
                    sourceEntityId: ea.id,
                    sourceColumnId: colOf(ea, ac).id,
                    sourceSchema: ea.schema,
                    targetEntityId: eb.id,
                    targetColumnId: colOf(eb, bc).id,
                    targetSchema: eb.schema,
                    sourceCardinality: 'one',
                    targetCardinality: 'many',
                    createdAt: NOW,
                },
            },
            order: [id],
        },
    };
}

/** Model S3, one dialect-specific design per dialect (spec 10.3). */
export function sampleS3(
    type: 'postgresql' | 'mysql' | 'sql_server' | 'sqlite'
): Design {
    if (type === 'postgresql')
        return make(
            type,
            [
                {
                    name: 'tickets',
                    columns: [
                        col('id', 'bigint', {
                            primary: true,
                            nullable: false,
                            numbered: true,
                        }),
                        col('status', 'ticket_status', {
                            nullable: false,
                            default: "'open'",
                        }),
                        col('tags', 'text', { isArray: true }),
                        col('payload', 'jsonb', { default: "'{}'" }),
                        col('title', 'varchar', {
                            length: 200,
                            nullable: false,
                            unique: true,
                        }),
                    ],
                    indexes: [
                        {
                            name: 'idx_tickets_tags',
                            unique: false,
                            columns: ['tags'],
                            method: 'gin',
                        },
                        {
                            name: 'uq_tickets_status_title',
                            unique: true,
                            columns: ['status', 'title'],
                        },
                    ],
                    checks: [],
                },
            ],
            [],
            [{ name: 'ticket_status', values: ['open', 'closed', "it's done"] }]
        );
    if (type === 'mysql')
        return make(type, [
            {
                name: 'events',
                schema: 'app',
                columns: [
                    col('id', 'bigint', {
                        primary: true,
                        nullable: false,
                        numbered: true,
                    }),
                    col('code', 'varchar', { nullable: false, unique: true }),
                    col('body', 'text'),
                    col('active', 'boolean', {
                        nullable: false,
                        default: 'true',
                    }),
                    col('payload', 'json'),
                ],
                indexes: [
                    { name: 'idx_body', unique: false, columns: ['body'] },
                    { name: 'uq_code', unique: true, columns: ['code'] },
                ],
                checks: [],
            },
        ]);
    if (type === 'sql_server')
        return make(type, [
            {
                name: 'Invoice',
                columns: [
                    col('Id', 'int', {
                        primary: true,
                        nullable: false,
                        numbered: true,
                    }),
                    col('Number', 'varchar', {
                        length: 'max',
                        nullable: false,
                    }),
                    col('IssuedAt', 'datetimeoffset', {
                        nullable: false,
                        default: '(sysdatetimeoffset())',
                    }),
                    col('Total', 'money', {
                        nullable: false,
                        default: '((0))',
                    }),
                    col('Paid', 'bit', { nullable: false, default: '((0))' }),
                    col('Note', 'nvarchar', {
                        length: 500,
                        default: "(N'n/a')",
                    }),
                ],
                indexes: [
                    {
                        name: 'IX_Invoice_Number',
                        unique: true,
                        columns: ['Number'],
                    },
                ],
                checks: [],
            },
        ]);
    return make(type, [
        {
            name: 'files',
            columns: [
                col('id', 'integer', {
                    primary: true,
                    nullable: false,
                    numbered: true,
                }),
                col('path', 'varchar', {
                    length: 255,
                    nullable: false,
                    unique: true,
                }),
                col('size', 'bigint'),
                col('is_public', 'boolean', { nullable: false, default: '0' }),
                col('checksum', 'blob'),
            ],
            indexes: [
                {
                    name: 'uq_files_path_size',
                    unique: true,
                    columns: ['path', 'size'],
                },
            ],
            checks: [],
        },
        {
            name: 'sqlite_sequence',
            columns: [col('name', 'text'), col('seq', 'integer')],
            indexes: [],
            checks: [],
        },
    ]);
}
