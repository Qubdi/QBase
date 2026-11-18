import {
    canonicalType,
    diagramToDesc,
    type ColumnDesc,
    type DiagramLike,
    type SchemaDesc,
    type TableDesc,
} from './schema-desc.js';

// A rules engine that reviews a diagram and lists problems. lint() is pure and
// has no dependencies: the editor, the server API and the CLI all call it.

export type LintSeverity = 'error' | 'warning' | 'info';

export type RuleId =
    | 'table-without-primary-key'
    | 'foreign-key-without-index'
    | 'foreign-key-type-mismatch'
    | 'nullable-in-unique-key'
    | 'duplicate-index'
    | 'overlapping-index'
    | 'naming-case'
    | 'naming-plural'
    | 'reserved-word'
    | 'orphan-table'
    | 'missing-table-description'
    | 'varchar-without-length';

export interface RuleInfo {
    id: RuleId;
    title: string;
    description: string;
    defaultSeverity: LintSeverity;
    defaultEnabled: boolean;
}

export const RULES: RuleInfo[] = [
    {
        id: 'table-without-primary-key',
        title: 'Table without a primary key',
        description: 'Every table should have a primary key.',
        defaultSeverity: 'error',
        defaultEnabled: true,
    },
    {
        id: 'foreign-key-without-index',
        title: 'Foreign key without an index',
        description:
            'Joins and deletes on the parent are slow without an index on the foreign key column.',
        defaultSeverity: 'warning',
        defaultEnabled: true,
    },
    {
        id: 'foreign-key-type-mismatch',
        title: 'Foreign key type differs from the referenced column',
        description:
            'The two columns of a relationship should have the same type.',
        defaultSeverity: 'error',
        defaultEnabled: true,
    },
    {
        id: 'nullable-in-unique-key',
        title: 'Nullable column in a unique key',
        description:
            'Most databases allow many NULLs in a unique key, so it does not enforce what it seems to.',
        defaultSeverity: 'warning',
        defaultEnabled: true,
    },
    {
        id: 'duplicate-index',
        title: 'Duplicate index',
        description:
            'Two indexes on the same columns, or an index repeating the primary key.',
        defaultSeverity: 'warning',
        defaultEnabled: true,
    },
    {
        id: 'overlapping-index',
        title: 'Overlapping index',
        description:
            'An index that is only the beginning of another index adds write cost for no benefit.',
        defaultSeverity: 'info',
        defaultEnabled: true,
    },
    {
        id: 'naming-case',
        title: 'Inconsistent name style',
        description: 'Mixing snake_case and camelCase.',
        defaultSeverity: 'warning',
        defaultEnabled: true,
    },
    {
        id: 'naming-plural',
        title: 'Inconsistent table name number',
        description: 'Mixing singular and plural table names.',
        defaultSeverity: 'info',
        defaultEnabled: true,
    },
    {
        id: 'reserved-word',
        title: 'Reserved word as a name',
        description:
            'Names that are SQL reserved words need quoting everywhere.',
        defaultSeverity: 'warning',
        defaultEnabled: true,
    },
    {
        id: 'orphan-table',
        title: 'Table without relationships',
        description: 'A table nothing references and that references nothing.',
        defaultSeverity: 'info',
        defaultEnabled: true,
    },
    {
        id: 'missing-table-description',
        title: 'Table without a description',
        description: 'Document what each table is for.',
        defaultSeverity: 'info',
        defaultEnabled: false,
    },
    {
        id: 'varchar-without-length',
        title: 'varchar without a length',
        description:
            'On SQL Server a bare varchar is one character; MySQL and MariaDB reject it.',
        defaultSeverity: 'error',
        defaultEnabled: true,
    },
];

export interface LintConfig {
    rules?: Partial<
        Record<RuleId, { enabled?: boolean; severity?: LintSeverity }>
    >;
    naming?: {
        /** auto = whichever style the diagram mostly uses */
        style?: 'auto' | 'snake_case' | 'camelCase';
        /** consistent = flag the minority; or force one */
        tables?: 'consistent' | 'plural' | 'singular' | 'any';
    };
}

export type LintTarget =
    | { type: 'table'; tableId?: string; tableName: string }
    | {
          type: 'column';
          tableId?: string;
          tableName: string;
          columnId?: string;
          columnName: string;
      }
    | {
          type: 'index';
          tableId?: string;
          tableName: string;
          indexId?: string;
          indexName: string;
      }
    | {
          type: 'relationship';
          relationshipId?: string;
          name: string;
          tableName: string;
          tableId?: string;
          columnName?: string;
          columnId?: string;
      };

/** A change the editor can apply on its own. */
export type LintFix =
    | {
          action: 'add_index';
          tableId?: string;
          tableName: string;
          indexName: string;
          columnIds: string[];
          columnNames: string[];
      }
    | {
          action: 'remove_index';
          tableId?: string;
          tableName: string;
          indexId?: string;
          indexName: string;
      }
    | {
          action: 'set_column_type';
          tableId?: string;
          tableName: string;
          columnId?: string;
          columnName: string;
          typeName: string;
      }
    | {
          action: 'set_column_length';
          tableId?: string;
          tableName: string;
          columnId?: string;
          columnName: string;
          length: string;
      }
    | {
          action: 'rename_table';
          tableId?: string;
          tableName: string;
          to: string;
      }
    | {
          action: 'rename_column';
          tableId?: string;
          tableName: string;
          columnId?: string;
          columnName: string;
          to: string;
      };

/**
 * The English text of every finding, with `{{name}}` placeholders. The editor
 * looks the same key up in its own translations (`qubdi.database.lint.messages`),
 * so a finding reads in the user's language; the server and the CLI print this.
 */
export const MESSAGES = {
    noPrimaryKey: 'Table {{table}} has no primary key.',
    orphanTable: 'Table {{table}} has no relationships.',
    noDescription: 'Table {{table}} has no description.',
    reservedTable: 'Table name "{{table}}" is a reserved word.',
    reservedColumn: 'Column "{{table}}.{{column}}" is a reserved word.',
    varcharNoLength:
        'Column {{table}}.{{column}} is {{type}} without a length.',
    nullableInUniqueIndex:
        'Column {{table}}.{{column}} is nullable but part of unique index {{index}}.',
    nullableUnique: 'Column {{table}}.{{column}} is nullable but unique.',
    indexRepeatsPk: 'Index {{index}} on {{table}} repeats the primary key.',
    indexDuplicate: 'Index {{index}} on {{table}} duplicates {{other}}.',
    indexCovered:
        'Index {{index}} on {{table}} is already covered by {{other}}.',
    indexCoveredByPk:
        'Index {{index}} on {{table}} is already covered by the primary key.',
    fkTypeMismatch:
        '{{from}}.{{column}} is {{type}} but references {{to}}.{{toColumn}} which is {{toType}}.',
    fkNoIndex: 'Foreign key {{from}}({{columns}}) \u2192 {{to}} has no index.',
    tableCase: 'Table "{{name}}" is not {{style}}.',
    columnCase: 'Column "{{table}}.{{name}}" is not {{style}}.',
    tableSingular: 'Table "{{table}}" is singular but most tables are plural.',
    tablePlural: 'Table "{{table}}" is plural but most tables are singular.',
} as const;

export type MessageKey = keyof typeof MESSAGES;
export type MessageArgs = Record<string, string>;
interface Msg {
    key: MessageKey;
    args: MessageArgs;
}
const msg = (key: MessageKey, args: MessageArgs): Msg => ({ key, args });
const renderMessage = (m: Msg): string =>
    MESSAGES[m.key].replace(
        /\{\{(\w+)\}\}/g,
        (_, k: string) => m.args[k] ?? ''
    );

export interface Finding {
    /** stable across runs, so the UI can keep selection and dismissals */
    id: string;
    ruleId: RuleId;
    severity: LintSeverity;
    target: LintTarget;
    message: string;
    /** the key and values of `message`, for translating it */
    messageKey?: MessageKey;
    messageArgs?: MessageArgs;
    fix?: LintFix;
}

export interface LintInput extends DiagramLike {
    databaseType?: string;
}

// --- helpers --------------------------------------------------------------------

const RESERVED = new Set(
    (
        'add all alter and any as asc authorization backup begin between by cascade case check column commit constraint ' +
        'create cross current_date current_time current_timestamp current_user database default delete desc distinct drop ' +
        'else end exec exists foreign from full grant group having in index inner insert intersect into is join key left ' +
        'like limit not null of offset on or order outer primary references revoke right rollback rows select session_user ' +
        'set some table then to top transaction trigger union unique update user using values view when where with'
    ).split(' ')
);
const DIALECT_RESERVED: Record<string, string[]> = {
    sql_server: [
        'identity',
        'public',
        'plan',
        'file',
        'percent',
        'proc',
        'procedure',
        'pivot',
        'open',
        'schema',
    ],
    mysql: [
        'rank',
        'groups',
        'function',
        'lateral',
        'range',
        'system',
        'schema',
        'both',
        'explain',
    ],
    mariadb: ['rank', 'function', 'range', 'schema', 'both', 'explain'],
    postgresql: [
        'analyse',
        'analyze',
        'array',
        'both',
        'collate',
        'do',
        'leading',
        'localtime',
        'only',
        'placing',
        'returning',
        'symmetric',
        'trailing',
        'variadic',
        'window',
    ],
    oracle: [
        'comment',
        'level',
        'mode',
        'number',
        'resource',
        'size',
        'start',
        'uid',
        'rowid',
        'rownum',
    ],
};

export const isReservedWord = (name: string, dialect = ''): boolean =>
    RESERVED.has(name.toLowerCase()) ||
    // `databaseType` comes from the diagram, so "constructor" or "__proto__" must not reach the prototype
    (Object.hasOwn(DIALECT_RESERVED, dialect)
        ? DIALECT_RESERVED[dialect]
        : []
    ).includes(name.toLowerCase());

export type NameStyle = 'snake' | 'camel' | 'neutral';

/** snake_case and camelCase are only decisive when the name shows them. */
export function nameStyle(name: string): NameStyle {
    if (/_/.test(name.replace(/^_+|_+$/g, ''))) {
        return /[A-Z]/.test(name) ? 'neutral' : 'snake';
    }
    if (/^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(name)) return 'camel';
    return 'neutral';
}

export function toSnakeCase(name: string): string {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toLowerCase();
}

export function toCamelCase(name: string): string {
    const parts = toSnakeCase(name).split('_').filter(Boolean);
    return parts
        .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
        .join('');
}

const NOT_PLURAL = new Set([
    'status',
    'address',
    'class',
    'process',
    'series',
    'news',
    'analysis',
    'bus',
    'canvas',
    'access',
    'business',
    'progress',
    'species',
    'campus',
    'virus',
    'alias',
    'basis',
    'axis',
    'atlas',
    'bias',
    'gas',
    'glass',
    'lens',
    'loss',
    'mass',
    'pass',
    'plus',
    'chaos',
    'focus',
    'thesis',
    'crisis',
]);
const ALWAYS_PLURAL = new Set(['people', 'children', 'men', 'women', 'data']);

/** Last word of a table name decides whether it reads as plural. Heuristic, on purpose. */
export function isPluralName(name: string): boolean {
    const words = toSnakeCase(name).split('_').filter(Boolean);
    const last = words[words.length - 1] ?? '';
    if (ALWAYS_PLURAL.has(last)) return true;
    if (NOT_PLURAL.has(last)) return false;
    if (/(ss|us|is)$/.test(last)) return false;
    return /s$/.test(last);
}

const bare = (t: string) => t.split('.').pop() ?? t;

function findColumn(
    table: TableDesc | undefined,
    name: string
): ColumnDesc | undefined {
    return table?.columns.find(
        (c) => c.name.toLowerCase() === name.toLowerCase()
    );
}

const tableTarget = (t: TableDesc): LintTarget => ({
    type: 'table',
    tableId: t.id,
    tableName: t.name,
});
const columnTarget = (t: TableDesc, c: ColumnDesc): LintTarget => ({
    type: 'column',
    tableId: t.id,
    tableName: t.name,
    columnId: c.id,
    columnName: c.name,
});

// --- the engine -------------------------------------------------------------------

export function lint(input: LintInput, config: LintConfig = {}): Finding[] {
    const desc = diagramToDesc(input);
    const dialect = input.databaseType ?? '';
    const findings: Finding[] = [];

    const settings = (id: RuleId) => {
        const info = RULES.find((r) => r.id === id)!;
        const set = config.rules?.[id];
        return {
            enabled: set?.enabled ?? info.defaultEnabled,
            severity: set?.severity ?? info.defaultSeverity,
        };
    };
    const emit = (
        ruleId: RuleId,
        key: string,
        target: LintTarget,
        message: Msg,
        fix?: LintFix
    ) => {
        const s = settings(ruleId);
        if (!s.enabled) return;
        findings.push({
            id: `${ruleId}:${key}`,
            ruleId,
            severity: s.severity,
            target,
            message: renderMessage(message),
            messageKey: message.key,
            messageArgs: message.args,
            fix,
        });
    };

    const real = desc.tables.filter((t) => !t.isView);
    const byKey = new Map(desc.tables.map((t) => [t.key, t]));

    const linkedKeys = new Set<string>();
    for (const r of desc.relationships) {
        linkedKeys.add(r.fromTable);
        linkedKeys.add(r.toTable);
    }

    for (const t of real) {
        tableRules(t, desc, linkedKeys, dialect, emit);
    }
    relationshipRules(desc, byKey, emit);
    namingRules(desc, config, emit);

    const order: Record<LintSeverity, number> = {
        error: 0,
        warning: 1,
        info: 2,
    };
    return findings.sort(
        (a, b) =>
            order[a.severity] - order[b.severity] || a.id.localeCompare(b.id)
    );
}

type Emit = (
    ruleId: RuleId,
    key: string,
    target: LintTarget,
    message: Msg,
    fix?: LintFix
) => void;

function tableRules(
    t: TableDesc,
    desc: SchemaDesc,
    linkedKeys: ReadonlySet<string>,
    dialect: string,
    emit: Emit
) {
    if (!t.columns.some((c) => c.primaryKey)) {
        emit(
            'table-without-primary-key',
            t.key,
            tableTarget(t),
            msg('noPrimaryKey', { table: t.name })
        );
    }

    if (desc.tables.length > 1) {
        if (!linkedKeys.has(t.key)) {
            emit(
                'orphan-table',
                t.key,
                tableTarget(t),
                msg('orphanTable', { table: t.name })
            );
        }
    }

    if (!t.comment) {
        emit(
            'missing-table-description',
            t.key,
            tableTarget(t),
            msg('noDescription', { table: t.name })
        );
    }

    // reserved words (tables and columns)
    if (isReservedWord(t.name, dialect)) {
        emit(
            'reserved-word',
            `${t.key}`,
            tableTarget(t),
            msg('reservedTable', { table: t.name })
        );
    }
    for (const c of t.columns) {
        if (isReservedWord(c.name, dialect)) {
            emit(
                'reserved-word',
                `${t.key}.${c.name}`,
                columnTarget(t, c),
                msg('reservedColumn', { table: t.name, column: c.name })
            );
        }
    }

    // varchar without length
    if (['sql_server', 'mysql', 'mariadb'].includes(dialect)) {
        for (const c of t.columns) {
            if (/^(varchar|nvarchar|varbinary)$/.test(c.type) && !c.length) {
                emit(
                    'varchar-without-length',
                    `${t.key}.${c.name}`,
                    columnTarget(t, c),
                    msg('varcharNoLength', {
                        table: t.name,
                        column: c.name,
                        type: c.type,
                    }),
                    {
                        action: 'set_column_length',
                        tableId: t.id,
                        tableName: t.name,
                        columnId: c.id,
                        columnName: c.name,
                        length: '255',
                    }
                );
            }
        }
    }

    // nullable columns in unique keys
    const seen = new Set<string>();
    for (const ix of t.indexes.filter((i) => i.unique)) {
        for (const colName of ix.columns) {
            const c = findColumn(t, colName);
            if (c && c.nullable && !c.primaryKey && !seen.has(c.name)) {
                seen.add(c.name);
                emit(
                    'nullable-in-unique-key',
                    `${t.key}.${c.name}`,
                    columnTarget(t, c),
                    msg('nullableInUniqueIndex', {
                        table: t.name,
                        column: c.name,
                        index: ix.name,
                    })
                );
            }
        }
    }
    for (const c of t.columns) {
        if (c.unique && c.nullable && !c.primaryKey && !seen.has(c.name)) {
            seen.add(c.name);
            emit(
                'nullable-in-unique-key',
                `${t.key}.${c.name}`,
                columnTarget(t, c),
                msg('nullableUnique', { table: t.name, column: c.name })
            );
        }
    }

    indexRules(t, emit);
}

function indexRules(t: TableDesc, emit: Emit) {
    const pk = t.columns
        .filter((c) => c.primaryKey)
        .map((c) => c.name.toLowerCase());
    const lower = (cols: string[]) => cols.map((c) => c.toLowerCase());
    const removed = new Set<string>();

    const removeFix = (ix: TableDesc['indexes'][number]): LintFix => ({
        action: 'remove_index',
        tableId: t.id,
        tableName: t.name,
        indexId: ix.id,
        indexName: ix.name,
    });
    const target = (ix: TableDesc['indexes'][number]): LintTarget => ({
        type: 'index',
        tableId: t.id,
        tableName: t.name,
        indexId: ix.id,
        indexName: ix.name,
    });

    const sorted = [...t.indexes].sort((a, b) => a.name.localeCompare(b.name));
    // exact duplicates (and copies of the primary key)
    sorted.forEach((ix, i) => {
        const cols = lower(ix.columns).join(',');
        if (ix.columns.length === 0) return;
        const copiesPk = !ix.unique
            ? cols === pk.join(',') && pk.length > 0
            : false;
        const earlier = sorted
            .slice(0, i)
            .find(
                (o) =>
                    !removed.has(o.name) &&
                    lower(o.columns).join(',') === cols &&
                    o.unique === ix.unique
            );
        // a plain index next to a unique one on the same columns adds nothing,
        // whichever of the two comes first alphabetically
        const uniqueTwin = !ix.unique
            ? sorted.find(
                  (o) =>
                      o !== ix &&
                      o.unique &&
                      lower(o.columns).join(',') === cols
              )
            : undefined;
        const dup = earlier ?? uniqueTwin;
        if (copiesPk || dup) {
            removed.add(ix.name);
            emit(
                'duplicate-index',
                `${t.key}.${ix.name}`,
                target(ix),
                copiesPk
                    ? msg('indexRepeatsPk', { index: ix.name, table: t.name })
                    : msg('indexDuplicate', {
                          index: ix.name,
                          table: t.name,
                          other: dup!.name,
                      }),
                removeFix(ix)
            );
        }
    });

    // overlapping: a non-unique index that is only the start of a longer one
    for (const ix of sorted) {
        if (ix.unique || removed.has(ix.name) || ix.columns.length === 0)
            continue;
        const a = lower(ix.columns);
        const longer = t.indexes.find(
            (o) =>
                o !== ix &&
                !removed.has(o.name) &&
                o.columns.length > a.length &&
                lower(o.columns).slice(0, a.length).join(',') === a.join(',')
        );
        const coveredByPk =
            pk.length > a.length &&
            pk.slice(0, a.length).join(',') === a.join(',');
        if (longer || coveredByPk) {
            emit(
                'overlapping-index',
                `${t.key}.${ix.name}`,
                target(ix),
                longer
                    ? msg('indexCovered', {
                          index: ix.name,
                          table: t.name,
                          other: longer.name,
                      })
                    : msg('indexCoveredByPk', {
                          index: ix.name,
                          table: t.name,
                      }),
                removeFix(ix)
            );
        }
    }
}

function relationshipRules(
    desc: SchemaDesc,
    byKey: Map<string, TableDesc>,
    emit: Emit
) {
    for (const r of desc.relationships) {
        const from = byKey.get(r.fromTable);
        const to = byKey.get(r.toTable);
        if (!from || !to) continue;
        const fromCols = r.fromColumns.map((n) => findColumn(from, n));
        const toCols = r.toColumns.map((n) => findColumn(to, n));
        const key = `${r.fromTable}.${r.name}.${r.fromColumns.join(',')}`;
        const first = fromCols[0];
        const rTarget: LintTarget = {
            type: 'relationship',
            relationshipId: r.id,
            name: r.name,
            tableId: from.id,
            tableName: from.name,
            columnId: first?.id,
            columnName: r.fromColumns[0],
        };

        // type mismatch
        r.fromColumns.forEach((_, i) => {
            const a = fromCols[i];
            const b = toCols[i];
            if (a && b && canonicalType(a.type) !== canonicalType(b.type)) {
                emit(
                    'foreign-key-type-mismatch',
                    `${key}.${a.name}`,
                    rTarget,
                    msg('fkTypeMismatch', {
                        from: from.name,
                        column: a.name,
                        type: a.type,
                        to: to.name,
                        toColumn: b.name,
                        toType: b.type,
                    }),
                    {
                        action: 'set_column_type',
                        tableId: from.id,
                        tableName: from.name,
                        columnId: a.id,
                        columnName: a.name,
                        typeName: b.type,
                    }
                );
            }
        });

        // missing index: some index (or the primary key) must start with the FK columns
        const wanted = r.fromColumns.map((c) => c.toLowerCase());
        const pkCols = from.columns
            .filter((c) => c.primaryKey)
            .map((c) => c.name.toLowerCase());
        const starts = (cols: string[]) =>
            wanted.every((w, i) => cols[i] === w);
        const indexed =
            starts(pkCols) ||
            from.indexes.some((ix) =>
                starts(ix.columns.map((c) => c.toLowerCase()))
            ) ||
            // a single-column unique constraint is an index too
            (wanted.length === 1 && fromCols[0]?.unique === true);
        if (!indexed && fromCols.every(Boolean)) {
            emit(
                'foreign-key-without-index',
                key,
                rTarget,
                msg('fkNoIndex', {
                    from: from.name,
                    columns: r.fromColumns.join(', '),
                    to: bare(r.toTable),
                }),
                {
                    action: 'add_index',
                    tableId: from.id,
                    tableName: from.name,
                    indexName: `idx_${from.name}_${r.fromColumns.join('_')}`,
                    columnIds: fromCols.map((c) => c!.id ?? ''),
                    columnNames: r.fromColumns,
                }
            );
        }
    }
}

function namingRules(desc: SchemaDesc, config: LintConfig, emit: Emit) {
    // --- case: snake_case vs camelCase over table and column names
    const names: Array<{
        kind: 'table' | 'column';
        table: TableDesc;
        column?: ColumnDesc;
        name: string;
        style: NameStyle;
    }> = [];
    for (const t of desc.tables) {
        names.push({
            kind: 'table',
            table: t,
            name: t.name,
            style: nameStyle(t.name),
        });
        for (const c of t.columns)
            names.push({
                kind: 'column',
                table: t,
                column: c,
                name: c.name,
                style: nameStyle(c.name),
            });
    }
    const snake = names.filter((n) => n.style === 'snake').length;
    const camel = names.filter((n) => n.style === 'camel').length;
    const wanted: 'snake' | 'camel' | null =
        config.naming?.style === 'snake_case'
            ? 'snake'
            : config.naming?.style === 'camelCase'
              ? 'camel'
              : snake > 0 && camel > 0
                ? snake >= camel
                    ? 'snake'
                    : 'camel'
                : null;
    if (wanted) {
        for (const n of names) {
            if (n.style === 'neutral' || n.style === wanted) continue;
            const to =
                wanted === 'snake' ? toSnakeCase(n.name) : toCamelCase(n.name);
            const label = wanted === 'snake' ? 'snake_case' : 'camelCase';
            if (n.kind === 'table') {
                emit(
                    'naming-case',
                    n.table.key,
                    tableTarget(n.table),
                    msg('tableCase', { name: n.name, style: label }),
                    {
                        action: 'rename_table',
                        tableId: n.table.id,
                        tableName: n.table.name,
                        to,
                    }
                );
            } else {
                emit(
                    'naming-case',
                    `${n.table.key}.${n.name}`,
                    columnTarget(n.table, n.column!),
                    msg('columnCase', {
                        table: n.table.name,
                        name: n.name,
                        style: label,
                    }),
                    {
                        action: 'rename_column',
                        tableId: n.table.id,
                        tableName: n.table.name,
                        columnId: n.column!.id,
                        columnName: n.name,
                        to,
                    }
                );
            }
        }
    }

    // --- singular vs plural table names
    const mode = config.naming?.tables ?? 'consistent';
    if (mode === 'any') return;
    const tables = desc.tables.filter((t) => !t.isView);
    const plural = tables.filter((t) => isPluralName(t.name));
    const singular = tables.filter((t) => !isPluralName(t.name));
    let offenders: TableDesc[] = [];
    let expected = '';
    if (mode === 'plural') {
        offenders = singular;
        expected = 'plural';
    } else if (mode === 'singular') {
        offenders = plural;
        expected = 'singular';
    } else if (plural.length > 0 && singular.length > 0) {
        const pluralWins = plural.length >= singular.length;
        offenders = pluralWins ? singular : plural;
        expected = pluralWins ? 'plural' : 'singular';
    }
    for (const t of offenders) {
        emit(
            'naming-plural',
            t.key,
            tableTarget(t),
            msg(expected === 'plural' ? 'tableSingular' : 'tablePlural', {
                table: t.name,
            })
        );
    }
}

// --- config + reporting -------------------------------------------------------------

/** Drops anything that is not a known rule or value, so stored config can never break lint(). */
export function normalizeConfig(raw: unknown): LintConfig {
    const out: LintConfig = {};
    if (!raw || typeof raw !== 'object') return out;
    const cfg = raw as Record<string, unknown>;
    if (cfg.rules && typeof cfg.rules === 'object') {
        out.rules = {};
        for (const info of RULES) {
            const r = (cfg.rules as Record<string, unknown>)[info.id];
            if (!r || typeof r !== 'object') continue;
            const { enabled, severity } = r as {
                enabled?: unknown;
                severity?: unknown;
            };
            out.rules[info.id] = {
                ...(typeof enabled === 'boolean' ? { enabled } : {}),
                ...(severity === 'error' ||
                severity === 'warning' ||
                severity === 'info'
                    ? { severity }
                    : {}),
            };
        }
    }
    if (cfg.naming && typeof cfg.naming === 'object') {
        const n = cfg.naming as Record<string, unknown>;
        out.naming = {
            ...(['auto', 'snake_case', 'camelCase'].includes(n.style as string)
                ? { style: n.style as 'auto' | 'snake_case' | 'camelCase' }
                : {}),
            ...(['consistent', 'plural', 'singular', 'any'].includes(
                n.tables as string
            )
                ? {
                      tables: n.tables as
                          'consistent' | 'plural' | 'singular' | 'any',
                  }
                : {}),
        };
    }
    return out;
}

export interface LintSummary {
    error: number;
    warning: number;
    info: number;
    total: number;
}

export function summarizeFindings(findings: Finding[]): LintSummary {
    const s: LintSummary = {
        error: 0,
        warning: 0,
        info: 0,
        total: findings.length,
    };
    for (const f of findings) s[f.severity] += 1;
    return s;
}

/** True when anything is at or above the given severity; drives the CLI exit code. */
export function exceeds(findings: Finding[], threshold: LintSeverity): boolean {
    const rank: Record<LintSeverity, number> = {
        error: 0,
        warning: 1,
        info: 2,
    };
    return findings.some((f) => rank[f.severity] <= rank[threshold]);
}

export function formatFinding(f: Finding): string {
    return `${f.severity.toUpperCase().padEnd(7)} ${f.ruleId}  ${f.message}`;
}
