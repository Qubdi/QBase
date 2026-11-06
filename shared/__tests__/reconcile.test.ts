import { describe, expect, it } from 'vitest';
import { countByKind, isEmpty, reconcile, diffColumn } from '../reconcile';
import {
    canonicalType,
    diagramToDesc,
    metadataToDesc,
    type ColumnDesc,
    type IndexDesc,
    type RelationshipDesc,
    type SchemaDesc,
    type TableDesc,
} from '../schema-desc';

const col = (name: string, over: Partial<ColumnDesc> = {}): ColumnDesc => ({
    name,
    type: 'integer',
    nullable: true,
    primaryKey: false,
    unique: false,
    default: null,
    length: null,
    precision: null,
    scale: null,
    identity: false,
    comment: null,
    ...over,
});

const table = (
    name: string,
    columns: ColumnDesc[],
    over: Partial<TableDesc> = {}
): TableDesc => ({
    key: `public.${name}`,
    schema: 'public',
    name,
    isView: false,
    comment: null,
    columns,
    indexes: [],
    ...over,
});

const rel = (
    name: string,
    from: string,
    fromCol: string,
    to: string,
    toCol = 'id'
): RelationshipDesc => ({
    name,
    fromTable: `public.${from}`,
    fromColumns: [fromCol],
    toTable: `public.${to}`,
    toColumns: [toCol],
});

const schema = (
    tables: TableDesc[],
    relationships: RelationshipDesc[] = []
): SchemaDesc => ({ tables, relationships });

const users = () =>
    table('users', [
        col('id', { primaryKey: true, nullable: false }),
        col('email', { type: 'varchar', length: '120', nullable: false }),
    ]);

const kinds = (cs: ReturnType<typeof reconcile>) =>
    cs.changes.map((c) => c.kind);

describe('canonicalType', () => {
    it('folds synonyms, spacing, case and QBase-style ids together', () => {
        expect(canonicalType('INT4')).toBe('integer');
        expect(canonicalType('character varying')).toBe('varchar');
        expect(canonicalType('character_varying')).toBe('varchar');
        expect(canonicalType('Timestamp  Without Time Zone')).toBe('timestamp');
        expect(canonicalType('timestamp with time zone')).toBe('timestamptz');
        expect(canonicalType('bool')).toBe('boolean');
        expect(canonicalType('float8')).toBe('double precision');
        expect(canonicalType('decimal')).toBe('numeric');
    });

    it('keeps array markers and unknown types as they are', () => {
        expect(canonicalType('int4[]')).toBe('integer[]');
        expect(canonicalType('text[][]')).toBe('text[][]');
        expect(canonicalType('shop.order_status')).toBe('shop.order status');
        expect(canonicalType('hstore')).toBe('hstore');
    });
});

describe('metadataToDesc', () => {
    const meta = {
        tables: [{ schema: 's', table: 't', comment: 'about t' }],
        views: [{ schema: 's', view_name: 'v' }],
        columns: [
            {
                schema: 's',
                table: 't',
                name: 'b',
                type: 'character varying',
                ordinal_position: 2,
                nullable: false,
                character_maximum_length: '40',
            },
            {
                schema: 's',
                table: 't',
                name: 'a',
                type: 'integer',
                ordinal_position: 1,
                nullable: false,
                is_identity: true,
                default: 'nextval(x)',
            },
            {
                schema: 's',
                table: 't',
                name: 'tags',
                type: 'text',
                ordinal_position: 3,
                nullable: true,
                is_array: true,
            },
            {
                schema: 's',
                table: 'v',
                name: 'a',
                type: 'integer',
                ordinal_position: 1,
                nullable: true,
            },
        ],
        pk_info: [{ schema: 's', table: 't', column: 'a' }],
        indexes: [
            {
                schema: 's',
                table: 't',
                name: 'i2',
                column: 'b',
                unique: true,
                column_position: 1,
            },
            {
                schema: 's',
                table: 't',
                name: 'i1',
                column: 'a',
                unique: false,
                column_position: 2,
            },
            {
                schema: 's',
                table: 't',
                name: 'i1',
                column: 'b',
                unique: false,
                column_position: 1,
            },
        ],
        fk_info: [
            {
                schema: 's',
                table: 't',
                column: 'a',
                foreign_key_name: 'fk',
                reference_schema: 's',
                reference_table: 'u',
                reference_column: 'id',
            },
        ],
    };
    const d = metadataToDesc(meta);

    it('orders columns, canonicalises types and flags keys, identity and arrays', () => {
        const t = d.tables.find((x) => x.name === 't')!;
        expect(t.columns.map((c) => c.name)).toEqual(['a', 'b', 'tags']);
        expect(t.columns[0]).toMatchObject({
            primaryKey: true,
            identity: true,
            nullable: false,
            default: 'nextval(x)',
        });
        expect(t.columns[1]).toMatchObject({
            type: 'varchar',
            length: '40',
            unique: true,
        });
        expect(t.columns[2].type).toBe('text[]');
        expect(t.key).toBe('s.t');
        expect(t.comment).toBe('about t');
    });

    it('groups index rows by name in column order', () => {
        const t = d.tables.find((x) => x.name === 't')!;
        expect(t.indexes.find((i) => i.name === 'i1')?.columns).toEqual([
            'b',
            'a',
        ]);
        expect(t.indexes.find((i) => i.name === 'i2')).toMatchObject({
            unique: true,
            columns: ['b'],
        });
    });

    it('includes views, without indexes, and one relationship per column pair', () => {
        const v = d.tables.find((x) => x.name === 'v')!;
        expect(v.isView).toBe(true);
        expect(v.indexes).toEqual([]);
        expect(d.relationships).toEqual([
            {
                name: 'fk',
                fromTable: 's.t',
                fromColumns: ['a'],
                toTable: 's.u',
                toColumns: ['id'],
            },
        ]);
    });
});

describe('diagramToDesc', () => {
    const diagram = {
        tables: [
            {
                id: 't1',
                name: 'users',
                schema: 'public',
                comments: 'people',
                fields: [
                    {
                        id: 'f1',
                        name: 'id',
                        type: { id: 'bigint', name: 'bigint' },
                        primaryKey: true,
                        unique: false,
                        nullable: false,
                        increment: true,
                    },
                    {
                        id: 'f2',
                        name: 'email',
                        type: { id: 'varchar', name: 'varchar' },
                        primaryKey: false,
                        unique: true,
                        nullable: false,
                        characterMaximumLength: '120',
                    },
                ],
                indexes: [
                    {
                        id: 'i1',
                        name: 'ix',
                        unique: true,
                        fieldIds: ['f2', 'ghost'],
                    },
                ],
            },
            {
                id: 't2',
                name: 'orders',
                fields: [
                    {
                        id: 'f3',
                        name: 'id',
                        type: { name: 'int' },
                        primaryKey: true,
                        unique: false,
                        nullable: false,
                    },
                    {
                        id: 'f4',
                        name: 'user_id',
                        type: { name: 'int' },
                        primaryKey: false,
                        unique: false,
                        nullable: true,
                        isArray: true,
                    },
                ],
            },
        ],
        relationships: [
            {
                id: 'r1',
                name: 'orders_user',
                sourceTableId: 't1',
                targetTableId: 't2',
                sourceFieldId: 'f1',
                targetFieldId: 'f4',
            },
            {
                id: 'r2',
                name: 'broken',
                sourceTableId: 'nope',
                targetTableId: 't2',
                sourceFieldId: 'f1',
                targetFieldId: 'f4',
            },
        ],
    };
    const d = diagramToDesc(diagram);

    it('keeps ids and converts fields to canonical columns', () => {
        const t = d.tables[0];
        expect(t).toMatchObject({
            key: 'public.users',
            id: 't1',
            comment: 'people',
        });
        expect(t.columns[0]).toMatchObject({
            id: 'f1',
            identity: true,
            primaryKey: true,
            type: 'bigint',
        });
        expect(t.columns[1]).toMatchObject({ length: '120', unique: true });
        expect(d.tables[1].columns[1].type).toBe('integer[]');
    });

    it('leaves out indexes it cannot express with columns (expression indexes)', () => {
        // the only index references a field that does not exist, like lower(email) would
        expect(d.tables[0].indexes).toEqual([]);
        const ok = diagramToDesc({
            tables: [
                {
                    id: 't',
                    name: 't',
                    fields: [
                        {
                            id: 'f',
                            name: 'email',
                            type: { name: 'text' },
                            primaryKey: false,
                            unique: false,
                            nullable: true,
                        },
                    ],
                    indexes: [
                        {
                            id: 'i1',
                            name: 'plain',
                            unique: true,
                            fieldIds: ['f'],
                        },
                        { id: 'i2', name: 'expr', unique: false, fieldIds: [] },
                    ],
                },
            ],
        });
        expect(ok.tables[0].indexes).toEqual([
            { id: 'i1', name: 'plain', unique: true, columns: ['email'] },
        ]);
    });

    it('flips QBase relationship direction and skips dangling ones', () => {
        expect(d.relationships).toEqual([
            {
                id: 'r1',
                name: 'orders_user',
                fromTable: '.orders',
                fromColumns: ['user_id'],
                toTable: 'public.users',
                toColumns: ['id'],
            },
        ]);
    });
});

describe('reconcile: identical schemas', () => {
    it('reports nothing', () => {
        const orders = () =>
            table('orders', [col('id', { primaryKey: true }), col('user_id')]);
        const a = schema(
            [users(), orders()],
            [rel('fk', 'orders', 'user_id', 'users')]
        );
        const b = schema(
            [users(), orders()],
            [rel('fk', 'orders', 'user_id', 'users')]
        );
        expect(isEmpty(reconcile(a, b))).toBe(true);
    });

    it('ignores foreign keys that point outside the introspected tables', () => {
        const a = schema([users()]);
        const b = schema(
            [users()],
            [rel('fk_out', 'users', 'id', 'elsewhere')]
        );
        expect(isEmpty(reconcile(a, b))).toBe(true);
    });

    it('reports nothing for two empty schemas', () => {
        expect(isEmpty(reconcile(schema([]), schema([])))).toBe(true);
    });
});

describe('reconcile: columns', () => {
    it('adds exactly the new column', () => {
        const db = users();
        db.columns.push(col('created_at', { type: 'timestamp' }));
        const cs = reconcile(schema([users()]), schema([db]));
        expect(cs.changes).toHaveLength(1);
        expect(cs.changes[0]).toMatchObject({
            kind: 'column_added',
            id: 'column_added:public.users.created_at',
        });
    });

    it('removes a column that no longer exists', () => {
        const db = users();
        db.columns.pop();
        const cs = reconcile(schema([users()]), schema([db]));
        expect(cs.changes.map((c) => c.id)).toEqual([
            'column_removed:public.users.email',
        ]);
    });

    it('does not guess when two diagram columns share one database column name', () => {
        const diagram = table('t', [col('Id'), col('ID')]);
        const db = table('t', [col('id')]);
        const cs = reconcile(schema([diagram]), schema([db]));
        // neither diagram column may be matched to the database's `id`
        expect(cs.changes.map((c) => c.kind).sort()).toEqual([
            'column_added',
            'column_removed',
            'column_removed',
        ]);
    });

    it('lists every changed attribute of a column', () => {
        const db = users();
        db.columns[1] = col('email', {
            type: 'text',
            nullable: true,
            default: "''",
            unique: true,
            comment: 'x',
        });
        const cs = reconcile(schema([users()]), schema([db]));
        const change = cs.changes[0];
        expect(change.kind).toBe('column_changed');
        if (change.kind === 'column_changed') {
            expect(change.changes.map((c) => c.field).sort()).toEqual([
                'comment',
                'default',
                'length',
                'nullable',
                'type',
                'unique',
            ]);
            expect(change.changes.find((c) => c.field === 'type')).toEqual({
                field: 'type',
                from: 'varchar',
                to: 'text',
            });
        }
    });

    it('detects primary key, identity, precision and scale changes', () => {
        const a = table('t', [
            col('n', { type: 'numeric', precision: 10, scale: 2 }),
        ]);
        const b = table('t', [
            col('n', {
                type: 'numeric',
                precision: 12,
                scale: 4,
                primaryKey: true,
                identity: true,
            }),
        ]);
        const cs = reconcile(schema([a]), schema([b]));
        const change = cs.changes[0];
        if (change.kind !== 'column_changed')
            throw new Error('expected column_changed');
        expect(change.changes.map((c) => c.field).sort()).toEqual([
            'identity',
            'precision',
            'primaryKey',
            'scale',
        ]);
    });

    it('ignores whitespace-only differences and column name case', () => {
        const a = table('t', [col('Name', { default: ' 1 ' })]);
        const b = table('t', [col('name', { default: '1' })]);
        expect(isEmpty(reconcile(schema([a]), schema([b])))).toBe(true);
    });

    it('diffColumn compares nothing when equal', () => {
        expect(diffColumn(col('a'), col('a'))).toEqual([]);
    });
});

describe('reconcile: table identity', () => {
    it('adds and removes tables', () => {
        const cs = reconcile(
            schema([users(), table('legacy', [col('x')])]),
            schema([users(), table('fresh', [col('y', { type: 'text' })])])
        );
        expect(cs.changes.map((c) => c.id).sort()).toEqual([
            'table_added:public.fresh',
            'table_removed:public.legacy',
        ]);
    });

    it('keeps a table matched through a local rename using the stored source key', () => {
        const local = {
            ...users(),
            name: 'people',
            key: 'public.people',
            id: 'tbl1',
        };
        const cs = reconcile(schema([local]), schema([users()]), {
            sourceKeys: { tables: { tbl1: 'public.users' } },
        });
        expect(isEmpty(cs)).toBe(true);
        expect(cs.matched).toEqual([
            {
                diagramKey: 'public.people',
                dbKey: 'public.users',
                diagramId: 'tbl1',
            },
        ]);
    });

    it('falls back to the current name when nothing is stored', () => {
        const local = { ...users(), id: 'tbl1' };
        const cs = reconcile(schema([local]), schema([users()]));
        expect(cs.matched).toHaveLength(1);
        expect(isEmpty(cs)).toBe(true);
    });

    it('matches by name when the schema differs, but only if unambiguous', () => {
        const moved = { ...users(), key: 'app.users', schema: 'app' };
        expect(
            reconcile(schema([moved]), schema([users()])).matched
        ).toHaveLength(1);

        const a1 = { ...users(), key: 'a.users', schema: 'a' };
        const a2 = { ...users(), key: 'b.users', schema: 'b' };
        const cs = reconcile(schema([a1]), schema([a2, users()]));
        expect(cs.matched).toHaveLength(0);
        expect(kinds(cs).sort()).toEqual([
            'table_added',
            'table_added',
            'table_removed',
        ]);
    });

    it('matches case-insensitively', () => {
        const local = { ...users(), key: 'PUBLIC.USERS', name: 'USERS' };
        expect(
            reconcile(schema([local]), schema([users()])).matched
        ).toHaveLength(1);
    });

    it('reports a table comment change', () => {
        const db = { ...users(), comment: 'the people' };
        const cs = reconcile(schema([users()]), schema([db]));
        expect(cs.changes).toEqual([
            {
                id: 'table_comment_changed:public.users',
                kind: 'table_comment_changed',
                tableKey: 'public.users',
                from: null,
                to: 'the people',
            },
        ]);
    });
});

describe('reconcile: ignoreComments', () => {
    it('reports comment differences by default and skips them on request', () => {
        const a = users();
        a.comment = 'mine';
        a.columns[1].comment = 'mine too';
        const b = users();
        b.comment = 'theirs';
        b.columns[1].comment = 'theirs too';
        expect(
            reconcile(schema([a]), schema([b]))
                .changes.map((c) => c.kind)
                .sort()
        ).toEqual(['column_changed', 'table_comment_changed']);
        expect(
            isEmpty(
                reconcile(schema([a]), schema([b]), { ignoreComments: true })
            )
        ).toBe(true);
    });

    it('still reports other column differences when comments are ignored', () => {
        const a = users();
        a.columns[1].comment = 'x';
        const b = users();
        b.columns[1] = col('email', {
            type: 'text',
            comment: 'y',
            nullable: false,
        });
        const [change] = reconcile(schema([a]), schema([b]), {
            ignoreComments: true,
        }).changes;
        expect(change.kind).toBe('column_changed');
        if (change.kind === 'column_changed') {
            expect(change.changes.map((f) => f.field)).not.toContain('comment');
        }
    });
});

describe('reconcile: locally renamed columns', () => {
    it('does not make indexes or relationships look different', () => {
        const local = table('orders', [
            col('id', { primaryKey: true }),
            col('buyer_id', { id: 'f2' }),
        ]);
        local.indexes = [{ name: 'ix', unique: false, columns: ['buyer_id'] }];
        const remote = table('orders', [
            col('id', { primaryKey: true }),
            col('user_id'),
        ]);
        remote.indexes = [{ name: 'ix', unique: false, columns: ['user_id'] }];
        const a = schema(
            [users(), local],
            [rel('fk', 'orders', 'buyer_id', 'users')]
        );
        const b = schema(
            [users(), remote],
            [rel('fk', 'orders', 'user_id', 'users')]
        );
        const cs = reconcile(a, b, {
            sourceKeys: { columns: { f2: 'user_id' } },
        });
        expect(cs.changes.map((c) => c.id)).toEqual([]);
    });
});

describe('reconcile: rename hints', () => {
    it('offers a table rename when a table disappears and a look-alike appears', () => {
        const old = table('customers', [
            col('id', { primaryKey: true }),
            col('email', { type: 'varchar' }),
            col('name', { type: 'text' }),
        ]);
        const renamed = table('clients', [
            col('id', { primaryKey: true }),
            col('email', { type: 'varchar' }),
            col('name', { type: 'text' }),
            col('vip', { type: 'boolean' }),
        ]);
        const cs = reconcile(schema([old]), schema([renamed]));
        expect(cs.possibleRenames).toHaveLength(1);
        const r = cs.possibleRenames[0];
        expect(r).toMatchObject({
            entity: 'table',
            from: 'public.customers',
            to: 'public.clients',
        });
        expect(r.score).toBeCloseTo(0.75);
        // the renamed table's other differences are only relevant if the rename is accepted
        expect(r.followUps.map((c) => c.id)).toEqual([
            'column_added:public.customers.vip',
        ]);
        // without accepting it, the honest reading is still one table gone, one new
        expect(kinds(cs).sort()).toEqual(['table_added', 'table_removed']);
    });

    it('does not guess when tables are not alike', () => {
        const cs = reconcile(
            schema([table('a', [col('x'), col('y')])]),
            schema([
                table('b', [
                    col('p', { type: 'text' }),
                    col('q', { type: 'text' }),
                ]),
            ])
        );
        expect(cs.possibleRenames).toEqual([]);
    });

    it('pairs each table with at most one look-alike', () => {
        const mk = (name: string) =>
            table(name, [col('id'), col('a'), col('b')]);
        const cs = reconcile(
            schema([mk('old1'), mk('old2')]),
            schema([mk('new1')])
        );
        expect(cs.possibleRenames).toHaveLength(1);
    });

    it('offers a column rename when one column vanishes and one of the same type appears', () => {
        const a = table('t', [col('id'), col('fullname', { type: 'text' })]);
        const b = table('t', [col('id'), col('full_name', { type: 'text' })]);
        const cs = reconcile(schema([a]), schema([b]));
        expect(cs.possibleRenames).toMatchObject([
            {
                entity: 'column',
                tableKey: 'public.t',
                from: 'fullname',
                to: 'full_name',
            },
        ]);
        expect(kinds(cs).sort()).toEqual(['column_added', 'column_removed']);
    });

    it('does not guess a column rename when several columns could match', () => {
        const a = table('t', [
            col('a', { type: 'text' }),
            col('b', { type: 'text' }),
        ]);
        const b = table('t', [
            col('c', { type: 'text' }),
            col('d', { type: 'text' }),
        ]);
        expect(reconcile(schema([a]), schema([b])).possibleRenames).toEqual([]);
    });

    it('does not offer a rename across different types', () => {
        const a = table('t', [col('old', { type: 'text' })]);
        const b = table('t', [col('new', { type: 'integer' })]);
        expect(reconcile(schema([a]), schema([b])).possibleRenames).toEqual([]);
    });
});

describe('reconcile: indexes', () => {
    const ix = (
        name: string,
        columns: string[],
        unique = false
    ): IndexDesc => ({ name, columns, unique });

    it('adds and removes indexes by what they cover, not by name', () => {
        const a = users();
        a.indexes = [
            ix('old_name', ['email'], true),
            ix('gone', ['id', 'email']),
        ];
        const b = users();
        b.indexes = [ix('new_name', ['email'], true), ix('fresh', ['email'])];
        const cs = reconcile(schema([a]), schema([b]));
        expect(cs.changes.map((c) => c.id).sort()).toEqual([
            'index_added:public.users.fresh',
            'index_removed:public.users.gone',
        ]);
    });

    it('treats uniqueness as part of the index', () => {
        const a = users();
        a.indexes = [ix('i', ['email'], false)];
        const b = users();
        b.indexes = [ix('i', ['email'], true)];
        expect(kinds(reconcile(schema([a]), schema([b]))).sort()).toEqual([
            'index_added',
            'index_removed',
        ]);
    });

    it('ignores the index that only backs the primary key', () => {
        const a = users();
        a.indexes = [ix('pk_users_id', ['id'], true)];
        const b = users();
        b.indexes = [ix('users_pkey', ['id'], true)];
        expect(isEmpty(reconcile(schema([a]), schema([b])))).toBe(true);
        const c = users();
        expect(isEmpty(reconcile(schema([a]), schema([c])))).toBe(true);
    });
});

describe('reconcile: relationships', () => {
    const orders = () =>
        table('orders', [col('id', { primaryKey: true }), col('user_id')]);

    it('adds and removes relationships', () => {
        const withFk = schema(
            [users(), orders()],
            [rel('orders_user', 'orders', 'user_id', 'users')]
        );
        const without = schema([users(), orders()]);
        expect(reconcile(without, withFk).changes.map((c) => c.kind)).toEqual([
            'relationship_added',
        ]);
        expect(reconcile(withFk, without).changes.map((c) => c.kind)).toEqual([
            'relationship_removed',
        ]);
    });

    it('does not care about the constraint name when the columns agree', () => {
        const a = schema(
            [users(), orders()],
            [rel('fk_a', 'orders', 'user_id', 'users')]
        );
        const b = schema(
            [users(), orders()],
            [rel('fk_b', 'orders', 'user_id', 'users')]
        );
        expect(isEmpty(reconcile(a, b))).toBe(true);
    });

    it('reports a relationship that kept its name but points elsewhere as changed', () => {
        const a = schema(
            [
                users(),
                orders(),
                table('accounts', [col('id', { primaryKey: true })]),
            ],
            [rel('fk', 'orders', 'user_id', 'users')]
        );
        const b = schema(
            [
                users(),
                orders(),
                table('accounts', [col('id', { primaryKey: true })]),
            ],
            [rel('fk', 'orders', 'user_id', 'accounts')]
        );
        const cs = reconcile(a, b);
        expect(cs.changes.map((c) => c.kind)).toEqual(['relationship_changed']);
    });

    it('gives each changed relationship its own id when they share a table and a name', () => {
        const tables = () => [
            users(),
            table('accounts', [col('id', { primaryKey: true })]),
            table('orders', [
                col('id', { primaryKey: true }),
                col('user_id'),
                col('buyer_id'),
            ]),
        ];
        const a = schema(tables(), [
            rel('fk', 'orders', 'user_id', 'users'),
            rel('fk', 'orders', 'buyer_id', 'users'),
        ]);
        const b = schema(tables(), [
            rel('fk', 'orders', 'user_id', 'accounts'),
            rel('fk', 'orders', 'buyer_id', 'accounts'),
        ]);
        const ids = reconcile(a, b).changes.map((c) => c.id);
        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
    });

    it('does not list relationships of tables that are being removed', () => {
        const a = schema(
            [users(), orders()],
            [rel('fk', 'orders', 'user_id', 'users')]
        );
        const b = schema([users()]);
        expect(kinds(reconcile(a, b))).toEqual(['table_removed']);
    });

    it('lists relationships of new tables so they can be created with them', () => {
        const a = schema([users()]);
        const b = schema(
            [users(), orders()],
            [rel('fk', 'orders', 'user_id', 'users')]
        );
        expect(kinds(reconcile(a, b)).sort()).toEqual([
            'relationship_added',
            'table_added',
        ]);
    });

    it('follows a table matched under a different name', () => {
        const local = {
            ...users(),
            key: 'public.people',
            name: 'people',
            id: 'u',
        };
        const ord = { ...orders(), id: 'o' };
        const a = schema(
            [local, ord],
            [{ ...rel('fk', 'orders', 'user_id', 'people'), id: 'r1' }]
        );
        const b = schema(
            [users(), orders()],
            [rel('fk', 'orders', 'user_id', 'users')]
        );
        expect(
            isEmpty(
                reconcile(a, b, {
                    sourceKeys: { tables: { u: 'public.users' } },
                })
            )
        ).toBe(true);
    });
});

describe('reconcile: output shape', () => {
    it('is deterministic and sorted by id regardless of input order', () => {
        const a = schema([
            table('z', [col('x')]),
            table('a', [col('x')]),
            users(),
        ]);
        const b = schema([users()]);
        const forward = reconcile(a, b).changes.map((c) => c.id);
        const reversed = reconcile(
            schema([...a.tables].reverse()),
            b
        ).changes.map((c) => c.id);
        expect(forward).toEqual(reversed);
        expect(forward).toEqual([...forward].sort());
    });

    it('does not mutate its inputs', () => {
        const a = schema([users()]);
        const b = schema([users(), table('new', [col('x')])]);
        const before = JSON.stringify([a, b]);
        reconcile(a, b);
        expect(JSON.stringify([a, b])).toBe(before);
    });

    it('counts changes by kind', () => {
        const db = users();
        db.columns.push(col('a'), col('b'));
        expect(countByKind(reconcile(schema([users()]), schema([db])))).toEqual(
            { column_added: 2 }
        );
    });
});

describe('metadataToDesc on a big schema', () => {
    it('converts thousands of tables without reading every row once per table', () => {
        const tables = 4000;
        const meta = {
            tables: [] as Array<{ schema: string; table: string }>,
            columns: [] as Array<{
                schema: string;
                table: string;
                name: string;
                type: string;
                ordinal_position: number;
                nullable: boolean;
            }>,
            pk_info: [] as Array<{ schema: string; table: string; column: string }>,
            indexes: [] as Array<{
                schema: string;
                table: string;
                name: string;
                column: string;
                unique: boolean;
                column_position: number;
            }>,
            fk_info: [],
        };
        for (let t = 0; t < tables; t++) {
            const table = `t${t}`;
            meta.tables.push({ schema: 'public', table });
            for (let c = 0; c < 5; c++) {
                meta.columns.push({
                    schema: 'public',
                    table,
                    name: `c${c}`,
                    type: 'integer',
                    ordinal_position: 5 - c, // out of order on purpose
                    nullable: true,
                });
            }
            meta.pk_info.push({ schema: 'public', table, column: 'c0' });
            meta.indexes.push({ schema: 'public', table, name: `i${t}`, column: 'c1', unique: true, column_position: 1 });
        }
        const started = performance.now();
        const desc = metadataToDesc(meta);
        const ms = performance.now() - started;
        expect(desc.tables).toHaveLength(tables);
        const first = desc.tables[0];
        expect(first.columns.map((c) => c.name)).toEqual(['c4', 'c3', 'c2', 'c1', 'c0']);
        expect(first.columns.find((c) => c.name === 'c0')?.primaryKey).toBe(true);
        expect(first.columns.find((c) => c.name === 'c1')?.unique).toBe(true);
        expect(first.indexes).toEqual([{ name: 'i0', unique: true, columns: ['c1'] }]);
        // 4000 tables x 20000 columns would be 80 million row reads the old way
        expect(ms).toBeLessThan(1000);
    });
});
