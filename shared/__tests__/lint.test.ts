import { describe, expect, it } from 'vitest';
import {
    RULES,
    exceeds,
    formatFinding,
    isPluralName,
    isReservedWord,
    lint,
    nameStyle,
    normalizeConfig,
    summarizeFindings,
    toCamelCase,
    toSnakeCase,
    type Finding,
    type LintConfig,
    type LintInput,
    type RuleId,
} from '../lint';

// --- a tiny diagram builder ---------------------------------------------------

interface F {
    name: string;
    type?: string;
    pk?: boolean;
    nullable?: boolean;
    unique?: boolean;
    length?: string;
}
let uid = 0;
const id = (p: string) => `${p}${++uid}`;

const tbl = (
    name: string,
    fields: F[],
    over: {
        indexes?: Array<{ name: string; unique?: boolean; columns: string[] }>;
        comments?: string;
        isView?: boolean;
        schema?: string;
    } = {}
) => {
    const fs = fields.map((f) => ({
        id: id('f'),
        name: f.name,
        type: { name: f.type ?? 'integer' },
        primaryKey: f.pk ?? false,
        unique: f.unique ?? false,
        nullable: f.nullable ?? !f.pk,
        ...(f.length ? { characterMaximumLength: f.length } : {}),
    }));
    return {
        id: id('t'),
        name,
        schema: over.schema ?? 'public',
        isView: over.isView ?? false,
        comments: over.comments,
        fields: fs,
        indexes: (over.indexes ?? []).map((ix) => ({
            id: id('i'),
            name: ix.name,
            unique: ix.unique ?? false,
            fieldIds: ix.columns.map((c) => fs.find((f) => f.name === c)!.id),
        })),
    };
};
type T = ReturnType<typeof tbl>;

const link = (
    name: string,
    child: T,
    childCol: string,
    parent: T,
    parentCol = 'id'
) => ({
    id: id('r'),
    name,
    // ChartDB: source is the referenced table, target holds the foreign key
    sourceTableId: parent.id,
    targetTableId: child.id,
    sourceFieldId: parent.fields.find((f) => f.name === parentCol)!.id,
    targetFieldId: child.fields.find((f) => f.name === childCol)!.id,
});

const diagram = (
    tables: T[],
    relationships: ReturnType<typeof link>[] = [],
    databaseType = 'postgresql'
): LintInput => ({
    databaseType,
    tables,
    relationships,
});

const only = (findings: Finding[], rule: RuleId) =>
    findings.filter((f) => f.ruleId === rule);

// a healthy baseline: every rule should stay quiet on it
const users = () =>
    tbl(
        'users',
        [
            { name: 'id', pk: true },
            { name: 'email', type: 'varchar', length: '120', nullable: false },
        ],
        { comments: 'People' }
    );
const orders = () =>
    tbl(
        'orders',
        [
            { name: 'id', pk: true },
            { name: 'user_id', nullable: false },
        ],
        {
            comments: 'Purchases',
            indexes: [{ name: 'idx_orders_user_id', columns: ['user_id'] }],
        }
    );
const healthy = (): LintInput => {
    const u = users();
    const o = orders();
    return diagram([u, o], [link('orders_user', o, 'user_id', u)]);
};

describe('a healthy diagram', () => {
    it('produces no findings', () => {
        expect(lint(healthy())).toEqual([]);
    });

    it('handles empty and minimal input', () => {
        expect(lint({})).toEqual([]);
        expect(lint({ tables: [] })).toEqual([]);
        expect(
            lint(diagram([tbl('users', [{ name: 'id', pk: true }])]))
        ).toEqual([]);
    });
});

describe('table-without-primary-key', () => {
    it('fails for a table with no primary key', () => {
        const f = only(
            lint(diagram([tbl('logs', [{ name: 'msg', type: 'text' }])])),
            'table-without-primary-key'
        );
        expect(f).toHaveLength(1);
        expect(f[0]).toMatchObject({
            severity: 'error',
            target: { type: 'table', tableName: 'logs' },
        });
    });

    it('passes with a primary key, including a composite one', () => {
        const t = tbl('items', [
            { name: 'a', pk: true },
            { name: 'b', pk: true },
        ]);
        expect(only(lint(diagram([t])), 'table-without-primary-key')).toEqual(
            []
        );
    });

    it('does not ask views for a primary key', () => {
        const v = tbl('v_users', [{ name: 'id' }], { isView: true });
        expect(
            only(lint(diagram([v, users()])), 'table-without-primary-key')
        ).toEqual([]);
    });
});

describe('foreign-key-without-index', () => {
    const build = (
        indexes: Array<{ name: string; unique?: boolean; columns: string[] }>,
        fkUnique = false
    ) => {
        const u = users();
        const o = tbl(
            'orders',
            [
                { name: 'id', pk: true },
                { name: 'user_id', unique: fkUnique },
            ],
            { indexes, comments: 'x' }
        );
        return diagram([u, o], [link('fk', o, 'user_id', u)]);
    };

    it('fails when nothing indexes the foreign key column, and offers to add the index', () => {
        const f = only(lint(build([])), 'foreign-key-without-index');
        expect(f).toHaveLength(1);
        expect(f[0].severity).toBe('warning');
        expect(f[0].fix).toMatchObject({
            action: 'add_index',
            tableName: 'orders',
            columnNames: ['user_id'],
            indexName: 'idx_orders_user_id',
        });
        expect((f[0].fix as { columnIds: string[] }).columnIds).toHaveLength(1);
    });

    it('passes with an index that starts with the column', () => {
        expect(
            only(
                lint(build([{ name: 'i', columns: ['user_id'] }])),
                'foreign-key-without-index'
            )
        ).toEqual([]);
    });

    it('passes when the foreign key is the start of a composite index, but not the end of one', () => {
        const u = users();
        const o = tbl(
            'orders',
            [
                { name: 'id', pk: true },
                { name: 'user_id' },
                { name: 'created' },
            ],
            {
                indexes: [{ name: 'lead', columns: ['user_id', 'created'] }],
            }
        );
        expect(
            only(
                lint(diagram([u, o], [link('fk', o, 'user_id', u)])),
                'foreign-key-without-index'
            )
        ).toEqual([]);
        const o2 = tbl(
            'orders',
            [
                { name: 'id', pk: true },
                { name: 'user_id' },
                { name: 'created' },
            ],
            {
                indexes: [{ name: 'tail', columns: ['created', 'user_id'] }],
            }
        );
        expect(
            only(
                lint(diagram([u, o2], [link('fk', o2, 'user_id', u)])),
                'foreign-key-without-index'
            )
        ).toHaveLength(1);
    });

    it('passes when the column is the primary key or is unique', () => {
        const u = users();
        const profile = tbl('profiles', [{ name: 'user_id', pk: true }], {
            comments: 'x',
        });
        expect(
            only(
                lint(
                    diagram([u, profile], [link('fk', profile, 'user_id', u)])
                ),
                'foreign-key-without-index'
            )
        ).toEqual([]);
        expect(
            only(lint(build([], true)), 'foreign-key-without-index')
        ).toEqual([]);
    });
});

describe('foreign-key-type-mismatch', () => {
    const build = (childType: string, parentType = 'integer') => {
        const u = tbl('users', [{ name: 'id', pk: true, type: parentType }], {
            comments: 'x',
        });
        const o = tbl(
            'orders',
            [
                { name: 'id', pk: true },
                { name: 'user_id', type: childType },
            ],
            {
                comments: 'x',
                indexes: [{ name: 'i', columns: ['user_id'] }],
            }
        );
        return diagram([u, o], [link('fk', o, 'user_id', u)]);
    };

    it('fails when the types differ, and offers to align the foreign key column', () => {
        const f = only(lint(build('bigint')), 'foreign-key-type-mismatch');
        expect(f).toHaveLength(1);
        expect(f[0].severity).toBe('error');
        expect(f[0].fix).toMatchObject({
            action: 'set_column_type',
            columnName: 'user_id',
            typeName: 'integer',
        });
        expect(f[0].message).toMatch(
            /orders\.user_id is bigint but references users\.id which is integer/
        );
    });

    it('passes when the types match, including through synonyms', () => {
        expect(
            only(lint(build('integer')), 'foreign-key-type-mismatch')
        ).toEqual([]);
        expect(
            only(lint(build('int4', 'integer')), 'foreign-key-type-mismatch')
        ).toEqual([]);
        expect(
            only(
                lint(build('character varying', 'varchar')),
                'foreign-key-type-mismatch'
            )
        ).toEqual([]);
    });
});

describe('nullable-in-unique-key', () => {
    it('fails for a nullable column in a unique index or with a unique flag', () => {
        const t = tbl(
            'users',
            [
                { name: 'id', pk: true },
                { name: 'email', nullable: true },
                { name: 'handle', unique: true },
            ],
            {
                comments: 'x',
                indexes: [
                    { name: 'uq_email', unique: true, columns: ['email'] },
                ],
            }
        );
        const f = only(lint(diagram([t])), 'nullable-in-unique-key');
        expect(f.map((x) => x.target)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ columnName: 'email' }),
                expect.objectContaining({ columnName: 'handle' }),
            ])
        );
        expect(f).toHaveLength(2);
    });

    it('does not report the same column twice', () => {
        const t = tbl(
            'users',
            [
                { name: 'id', pk: true },
                { name: 'email', unique: true },
            ],
            {
                comments: 'x',
                indexes: [
                    { name: 'uq_email', unique: true, columns: ['email'] },
                ],
            }
        );
        expect(only(lint(diagram([t])), 'nullable-in-unique-key')).toHaveLength(
            1
        );
    });

    it('passes for NOT NULL columns, primary keys and non-unique indexes', () => {
        const t = tbl(
            'users',
            [
                { name: 'id', pk: true, unique: true },
                { name: 'email', nullable: false },
                { name: 'nick' },
            ],
            {
                comments: 'x',
                indexes: [
                    { name: 'uq', unique: true, columns: ['email'] },
                    { name: 'plain', columns: ['nick'] },
                ],
            }
        );
        expect(only(lint(diagram([t])), 'nullable-in-unique-key')).toEqual([]);
    });
});

describe('duplicate-index and overlapping-index', () => {
    const base = (
        indexes: Array<{ name: string; unique?: boolean; columns: string[] }>
    ) =>
        diagram([
            tbl(
                'users',
                [{ name: 'id', pk: true }, { name: 'a' }, { name: 'b' }],
                { comments: 'x', indexes }
            ),
        ]);

    it('flags an index that duplicates another, with a safe removal fix', () => {
        const f = only(
            lint(
                base([
                    { name: 'i1', columns: ['a'] },
                    { name: 'i2', columns: ['a'] },
                ])
            ),
            'duplicate-index'
        );
        expect(f).toHaveLength(1);
        expect(f[0].target).toMatchObject({ indexName: 'i2' });
        expect(f[0].fix).toMatchObject({
            action: 'remove_index',
            indexName: 'i2',
        });
    });

    it('flags a non-unique index that repeats the primary key', () => {
        const f = only(
            lint(base([{ name: 'again', columns: ['id'] }])),
            'duplicate-index'
        );
        expect(f).toHaveLength(1);
        expect(f[0].message).toMatch(/primary key/);
    });

    it('flags a non-unique copy of a unique index but never the unique one', () => {
        const f = only(
            lint(
                base([
                    { name: 'uq', unique: true, columns: ['a'] },
                    { name: 'plain', columns: ['a'] },
                ])
            ),
            'duplicate-index'
        );
        expect(
            f.map((x) => (x.target as { indexName: string }).indexName)
        ).toEqual(['plain']);
    });

    it('flags an index that is only the start of a longer one', () => {
        const f = only(
            lint(
                base([
                    { name: 'short', columns: ['a'] },
                    { name: 'long', columns: ['a', 'b'] },
                ])
            ),
            'overlapping-index'
        );
        expect(f).toHaveLength(1);
        expect(f[0]).toMatchObject({
            severity: 'info',
            target: { indexName: 'short' },
            fix: { action: 'remove_index' },
        });
    });

    it('does not call different indexes duplicates or overlaps', () => {
        const f = lint(
            base([
                { name: 'i1', columns: ['a'] },
                { name: 'i2', columns: ['b'] },
                { name: 'i3', columns: ['b', 'a'] },
                { name: 'uq', unique: true, columns: ['a', 'b'] },
            ])
        );
        expect(only(f, 'duplicate-index')).toEqual([]);
        // i1 (a) is not a prefix of i3 (b, a) nor uq? uq is unique and (a,b) starts with a: i1 is covered
        expect(
            only(f, 'overlapping-index').map(
                (x) => (x.target as { indexName: string }).indexName
            )
        ).toEqual(['i1', 'i2']);
    });

    it('passes with a clean set of indexes', () => {
        const f = lint(
            base([
                { name: 'i1', columns: ['a'] },
                { name: 'i2', columns: ['b'] },
            ])
        );
        expect(only(f, 'duplicate-index')).toEqual([]);
        expect(only(f, 'overlapping-index')).toEqual([]);
    });

    it('treats an index that is a prefix of the composite primary key as overlapping', () => {
        const t = tbl(
            'items',
            [
                { name: 'order_id', pk: true },
                { name: 'line', pk: true },
            ],
            {
                comments: 'x',
                indexes: [{ name: 'lead', columns: ['order_id'] }],
            }
        );
        expect(only(lint(diagram([t])), 'overlapping-index')).toHaveLength(1);
    });
});

describe('naming-case', () => {
    it('fails when snake_case and camelCase are mixed, flagging the minority with a rename fix', () => {
        const t = tbl(
            'user_accounts',
            [
                { name: 'id', pk: true },
                { name: 'first_name' },
                { name: 'last_name' },
                { name: 'createdAt' },
            ],
            { comments: 'x' }
        );
        const f = only(lint(diagram([t])), 'naming-case');
        expect(f).toHaveLength(1);
        expect(f[0]).toMatchObject({
            severity: 'warning',
            target: { columnName: 'createdAt' },
            fix: { action: 'rename_column', to: 'created_at' },
        });
    });

    it('flags the other side when camelCase is the majority', () => {
        const t = tbl(
            'userAccounts',
            [
                { name: 'id', pk: true },
                { name: 'firstName' },
                { name: 'lastName' },
                { name: 'created_at' },
            ],
            { comments: 'x' }
        );
        const f = only(lint(diagram([t])), 'naming-case');
        expect(f.map((x) => (x.fix as { to: string }).to)).toEqual([
            'createdAt',
        ]);
    });

    it('flags table names too', () => {
        const a = tbl('user_accounts', [{ name: 'id', pk: true }], {
            comments: 'x',
        });
        const b = tbl('orderItems', [{ name: 'id', pk: true }], {
            comments: 'x',
        });
        const c = tbl('audit_logs', [{ name: 'id', pk: true }], {
            comments: 'x',
        });
        const f = only(lint(diagram([a, b, c])), 'naming-case');
        expect(f).toHaveLength(1);
        expect(f[0].fix).toMatchObject({
            action: 'rename_table',
            tableName: 'orderItems',
            to: 'order_items',
        });
    });

    it('passes for a consistent style and ignores single-word names', () => {
        const t = tbl(
            'user_accounts',
            [
                { name: 'id', pk: true },
                { name: 'email' },
                { name: 'first_name' },
            ],
            { comments: 'x' }
        );
        expect(only(lint(diagram([t])), 'naming-case')).toEqual([]);
        const c = tbl(
            'userAccounts',
            [
                { name: 'id', pk: true },
                { name: 'email' },
                { name: 'firstName' },
            ],
            { comments: 'x' }
        );
        expect(only(lint(diagram([c])), 'naming-case')).toEqual([]);
    });

    it('lets the configured style win even in a consistent diagram', () => {
        const t = tbl(
            'userAccounts',
            [{ name: 'id', pk: true }, { name: 'firstName' }],
            { comments: 'x' }
        );
        const f = only(
            lint(diagram([t]), { naming: { style: 'snake_case' } }),
            'naming-case'
        );
        expect(f.map((x) => (x.fix as { to: string }).to).sort()).toEqual([
            'first_name',
            'user_accounts',
        ]);
        expect(
            only(
                lint(diagram([t]), { naming: { style: 'camelCase' } }),
                'naming-case'
            )
        ).toEqual([]);
    });
});

describe('naming-plural', () => {
    const tables = (names: string[]) =>
        diagram(
            names.map((n) =>
                tbl(n, [{ name: 'id', pk: true }], { comments: 'x' })
            )
        );

    it('fails when singular and plural table names are mixed, flagging the minority', () => {
        const f = only(
            lint(tables(['users', 'orders', 'invoice'])),
            'naming-plural'
        );
        expect(f).toHaveLength(1);
        expect(f[0]).toMatchObject({
            severity: 'info',
            target: { tableName: 'invoice' },
        });
    });

    it('passes when every name is plural or every name is singular', () => {
        expect(
            only(lint(tables(['users', 'orders'])), 'naming-plural')
        ).toEqual([]);
        expect(only(lint(tables(['user', 'order'])), 'naming-plural')).toEqual(
            []
        );
    });

    it('is not fooled by words that end in s but are singular', () => {
        expect(
            only(
                lint(tables(['users', 'orders', 'status', 'address'])),
                'naming-plural'
            )
                .map((x) => (x.target as { tableName: string }).tableName)
                .sort()
        ).toEqual(['address', 'status']);
        expect(
            only(lint(tables(['status', 'address', 'class'])), 'naming-plural')
        ).toEqual([]);
    });

    it('can be forced one way or switched off', () => {
        expect(
            only(
                lint(tables(['user', 'order']), {
                    naming: { tables: 'plural' },
                }),
                'naming-plural'
            )
        ).toHaveLength(2);
        expect(
            only(
                lint(tables(['users', 'orders']), {
                    naming: { tables: 'singular' },
                }),
                'naming-plural'
            )
        ).toHaveLength(2);
        expect(
            only(
                lint(tables(['users', 'invoice']), {
                    naming: { tables: 'any' },
                }),
                'naming-plural'
            )
        ).toEqual([]);
    });

    it('reads the last word of compound names', () => {
        expect(
            only(
                lint(tables(['order_items', 'user_accounts', 'audit_log'])),
                'naming-plural'
            ).map((x) => (x.target as { tableName: string }).tableName)
        ).toEqual(['audit_log']);
    });
});

describe('reserved-word', () => {
    it('fails for reserved table and column names', () => {
        const t = tbl(
            'order',
            [{ name: 'id', pk: true }, { name: 'group' }, { name: 'user' }],
            { comments: 'x' }
        );
        const f = only(lint(diagram([t])), 'reserved-word');
        expect(f.map((x) => x.id).sort()).toEqual([
            'reserved-word:public.order',
            'reserved-word:public.order.group',
            'reserved-word:public.order.user',
        ]);
        expect(f[0].severity).toBe('warning');
    });

    it('passes for ordinary names and is case-insensitive', () => {
        expect(
            only(
                lint(
                    diagram([
                        tbl(
                            'orders',
                            [{ name: 'id', pk: true }, { name: 'name' }],
                            { comments: 'x' }
                        ),
                    ])
                ),
                'reserved-word'
            )
        ).toEqual([]);
        expect(
            only(
                lint(
                    diagram([
                        tbl('t', [{ name: 'SELECT', pk: true }], {
                            comments: 'x',
                        }),
                    ])
                ),
                'reserved-word'
            )
        ).toHaveLength(1);
    });

    it('knows dialect specific words', () => {
        const t = () =>
            tbl('t', [{ name: 'id', pk: true }, { name: 'rank' }], {
                comments: 'x',
            });
        expect(
            only(lint(diagram([t()], [], 'mysql')), 'reserved-word')
        ).toHaveLength(1);
        expect(
            only(lint(diagram([t()], [], 'postgresql')), 'reserved-word')
        ).toEqual([]);
        expect(isReservedWord('identity', 'sql_server')).toBe(true);
        expect(isReservedWord('identity', 'postgresql')).toBe(false);
    });
});

describe('orphan-table', () => {
    it('fails for a table with no relationships when others exist', () => {
        const f = only(
            lint(
                diagram([
                    ...[users()],
                    tbl('lonely', [{ name: 'id', pk: true }], {
                        comments: 'x',
                    }),
                ])
            ),
            'orphan-table'
        );
        expect(
            f.map((x) => (x.target as { tableName: string }).tableName).sort()
        ).toEqual(['lonely', 'users']);
    });

    it('passes for related tables and for a diagram with a single table', () => {
        expect(only(lint(healthy()), 'orphan-table')).toEqual([]);
        expect(only(lint(diagram([users()])), 'orphan-table')).toEqual([]);
    });

    it('counts a table that is only referenced, or only references, as connected', () => {
        const u = users();
        const o = orders();
        const found = only(
            lint(diagram([u, o], [link('fk', o, 'user_id', u)])),
            'orphan-table'
        );
        expect(found).toEqual([]);
    });
});

describe('missing-table-description (off by default)', () => {
    it('is silent by default', () => {
        expect(
            only(
                lint(diagram([tbl('users', [{ name: 'id', pk: true }])])),
                'missing-table-description'
            )
        ).toEqual([]);
    });

    it('fails once enabled for a table without a description', () => {
        const cfg: LintConfig = {
            rules: { 'missing-table-description': { enabled: true } },
        };
        const f = only(
            lint(diagram([tbl('users', [{ name: 'id', pk: true }])]), cfg),
            'missing-table-description'
        );
        expect(f).toHaveLength(1);
        expect(f[0].severity).toBe('info');
    });

    it('passes when the table is described', () => {
        const cfg: LintConfig = {
            rules: { 'missing-table-description': { enabled: true } },
        };
        expect(
            only(
                lint(
                    diagram([
                        tbl('users', [{ name: 'id', pk: true }], {
                            comments: 'People',
                        }),
                    ]),
                    cfg
                ),
                'missing-table-description'
            )
        ).toEqual([]);
    });
});

describe('varchar-without-length', () => {
    const build = (dbType: string, type = 'varchar', length?: string) =>
        diagram(
            [
                tbl(
                    'users',
                    [
                        { name: 'id', pk: true },
                        { name: 'email', type, length },
                    ],
                    { comments: 'x' }
                ),
            ],
            [],
            dbType
        );

    it('fails on SQL Server and MySQL when varchar has no length, and offers a length', () => {
        for (const db of ['sql_server', 'mysql', 'mariadb']) {
            const f = only(lint(build(db)), 'varchar-without-length');
            expect(f, db).toHaveLength(1);
            expect(f[0]).toMatchObject({
                severity: 'error',
                fix: { action: 'set_column_length', length: '255' },
            });
        }
        expect(
            only(
                lint(build('sql_server', 'nvarchar')),
                'varchar-without-length'
            )
        ).toHaveLength(1);
    });

    it('passes when a length (or MAX) is given', () => {
        expect(
            only(
                lint(build('sql_server', 'varchar', '120')),
                'varchar-without-length'
            )
        ).toEqual([]);
        expect(
            only(
                lint(build('sql_server', 'varchar', 'max')),
                'varchar-without-length'
            )
        ).toEqual([]);
    });

    it('does not apply where the dialect does not need a length', () => {
        expect(
            only(lint(build('postgresql')), 'varchar-without-length')
        ).toEqual([]);
        expect(only(lint(build('sqlite')), 'varchar-without-length')).toEqual(
            []
        );
    });
});

describe('configuration', () => {
    const noPk = () => diagram([tbl('logs', [{ name: 'msg' }])]);

    it('can disable a rule', () => {
        expect(
            only(
                lint(noPk(), {
                    rules: { 'table-without-primary-key': { enabled: false } },
                }),
                'table-without-primary-key'
            )
        ).toEqual([]);
    });

    it('can change a rule severity', () => {
        const f = only(
            lint(noPk(), {
                rules: { 'table-without-primary-key': { severity: 'info' } },
            }),
            'table-without-primary-key'
        );
        expect(f[0].severity).toBe('info');
    });

    it('leaves other rules alone', () => {
        const cfg: LintConfig = {
            rules: { 'orphan-table': { enabled: false } },
        };
        expect(
            only(lint(noPk(), cfg), 'table-without-primary-key')
        ).toHaveLength(1);
    });

    it('normalizeConfig keeps good values and drops junk', () => {
        expect(normalizeConfig(null)).toEqual({});
        expect(normalizeConfig('x')).toEqual({});
        const cleaned = normalizeConfig({
            rules: {
                'orphan-table': { enabled: false, severity: 'error' },
                nope: { enabled: false },
                'duplicate-index': { enabled: 'yes', severity: 'loud' },
            },
            naming: { style: 'snake_case', tables: 'weird' },
        });
        expect(cleaned).toEqual({
            rules: {
                'orphan-table': { enabled: false, severity: 'error' },
                'duplicate-index': {},
            },
            naming: { style: 'snake_case' },
        });
    });

    it('lists every rule with title, description and defaults, one per id', () => {
        expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
        for (const r of RULES) {
            expect(r.title.length).toBeGreaterThan(3);
            expect(r.description.length).toBeGreaterThan(10);
        }
        expect(RULES.filter((r) => !r.defaultEnabled).map((r) => r.id)).toEqual(
            ['missing-table-description']
        );
    });
});

describe('results', () => {
    const messy = (): LintInput =>
        diagram([
            tbl('Order', [{ name: 'x' }]),
            tbl('users', [{ name: 'id', pk: true }], { comments: 'x' }),
        ]);

    it('are sorted most serious first, then by id, and are stable', () => {
        const a = lint(messy());
        const b = lint(messy());
        // ids differ only in generated ids, which findings do not use
        expect(a.map((f) => f.id)).toEqual(b.map((f) => f.id));
        const order = { error: 0, warning: 1, info: 2 };
        expect(a.map((f) => order[f.severity])).toEqual(
            [...a.map((f) => order[f.severity])].sort()
        );
    });

    it('summarize counts severities', () => {
        const s = summarizeFindings(lint(messy()));
        expect(s.total).toBe(s.error + s.warning + s.info);
        expect(s.error).toBeGreaterThan(0);
    });

    it('exceeds drives the exit code', () => {
        const f = lint(messy());
        expect(exceeds(f, 'error')).toBe(true);
        expect(exceeds([], 'info')).toBe(false);
        const infoOnly = lint(
            diagram([
                tbl('users', [{ name: 'id', pk: true }], { comments: 'x' }),
                tbl('orders', [{ name: 'id', pk: true }], { comments: 'x' }),
            ])
        );
        expect(exceeds(infoOnly, 'error')).toBe(false);
        expect(exceeds(infoOnly, 'warning')).toBe(false);
        expect(exceeds(infoOnly, 'info')).toBe(true);
    });

    it('formats a finding on one line', () => {
        const line = formatFinding(
            lint(diagram([tbl('logs', [{ name: 'msg' }])]))[0]
        );
        expect(line).toMatch(
            /^ERROR\s+table-without-primary-key\s+Table logs has no primary key\.$/
        );
    });

    it('does not mutate its input', () => {
        const d = messy();
        const before = JSON.stringify(d);
        lint(d);
        expect(JSON.stringify(d)).toBe(before);
    });
});

describe('name helpers', () => {
    it('classifies name styles', () => {
        expect(nameStyle('first_name')).toBe('snake');
        expect(nameStyle('firstName')).toBe('camel');
        expect(nameStyle('users')).toBe('neutral');
        expect(nameStyle('FirstName')).toBe('neutral');
        expect(nameStyle('_private')).toBe('neutral');
        expect(nameStyle('ID')).toBe('neutral');
    });

    it('converts between styles', () => {
        expect(toSnakeCase('createdAt')).toBe('created_at');
        expect(toSnakeCase('Order Items')).toBe('order_items');
        expect(toSnakeCase('already_snake')).toBe('already_snake');
        expect(toCamelCase('created_at')).toBe('createdAt');
        expect(toCamelCase('order_items')).toBe('orderItems');
        expect(toCamelCase('plain')).toBe('plain');
    });

    it('guesses plurals sensibly', () => {
        for (const p of [
            'users',
            'orders',
            'categories',
            'boxes',
            'people',
            'order_items',
        ])
            expect(isPluralName(p), p).toBe(true);
        for (const s of [
            'user',
            'order',
            'status',
            'address',
            'class',
            'process',
            'audit_log',
            'analysis',
            'bus',
        ])
            expect(isPluralName(s), s).toBe(false);
    });
});
