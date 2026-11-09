import { Parser } from '@dbml/core';
import { parseTypeDeclaration } from '@/core/model/type-declaration';
import type { DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import type { RandomInt } from '@/core/model/ids';
import { isKeyMethod } from '@/core/model/key';
import { dialectFor } from '@/dialects/registry';
import type { Diagnostic } from '@/dialects/script-model';
import { DesignBuilder } from '../shared/design-builder';
import type {
    ColumnSpec,
    IndexSpec,
    TableSpec,
} from '../shared/design-builder';
import { checkExpression } from '../sql/check-expression';
import { prepareDbml } from './prepare';

export interface DbmlImportOptions {
    now?: number;
    random?: RandomInt;
    name?: string;
}

export interface DbmlImportResult {
    design?: Design;
    diagnostics: Diagnostic[];
    counts: { tables: number; relationships: number };
}

/** The parts of @dbml/core's model that this importer reads. */
interface DbmlDefault {
    type: string;
    value: string | number | boolean;
}
interface DbmlField {
    name: string;
    type: { type_name: string };
    pk?: boolean;
    unique?: boolean;
    not_null?: boolean;
    increment?: boolean;
    dbdefault?: DbmlDefault;
    note?: string | null;
}
interface DbmlIndex {
    name?: string;
    pk?: boolean;
    unique?: boolean;
    type?: string;
    note?: string | null;
    columns: { type: string; value: string }[];
}
interface DbmlTable {
    name: string;
    schemaName?: string | null;
    note?: string | null;
    fields: DbmlField[];
    indexes: DbmlIndex[];
    checks?: { expression: string }[];
}
interface DbmlRef {
    name?: string | null;
    token?: { start: { line: number; column: number } };
    endpoints: {
        tableName: string;
        schemaName?: string | null;
        fieldNames: string[];
        relation: string;
    }[];
}
interface DbmlSchema {
    name: string;
    tables: DbmlTable[];
    refs: DbmlRef[];
    enums: { name: string; values: { name: string }[] }[];
}

const NONE = { tables: 0, relationships: 0 };

function defaultText(d: DbmlDefault): string {
    if (d.type === 'string') return `'${String(d.value).replace(/'/g, "''")}'`;
    return String(d.value);
}

function failure(diagnostics: Diagnostic[]): DbmlImportResult {
    return { diagnostics, counts: NONE };
}

/** Reads DBML text into a design (IMP-045 to IMP-055). */
export function importDbml(
    text: string,
    databaseType: DatabaseType,
    options: DbmlImportOptions = {}
): DbmlImportResult {
    const dialect = dialectFor(databaseType);
    const prepared = prepareDbml(text);
    const diagnostics: Diagnostic[] = [];

    for (const [key, at] of prepared.arrayFields) {
        if (dialect.capabilities.arrayColumns) continue;
        const field = key.slice(key.indexOf('.') + 1);
        return failure([
            {
                severity: 'error',
                message: `Array types are not supported for ${dialect.label} database. Field "${field}" has array type "${at.written}" which is not allowed.`,
                line: at.line,
                column: at.column,
            },
        ]);
    }
    for (const [key, list] of prepared.fieldChecks)
        for (const c of list) {
            const problem = checkExpression(c.expression);
            if (problem)
                return failure([
                    {
                        severity: 'error',
                        message: `Invalid check on ${key}: ${problem.message}`,
                        line: c.line,
                        column: c.column + problem.column,
                    },
                ]);
        }

    let schemas: DbmlSchema[];
    try {
        schemas = (
            Parser.parse(prepared.text, 'dbmlv2') as unknown as {
                schemas: DbmlSchema[];
            }
        ).schemas;
    } catch (e) {
        const diag = (
            e as {
                diags?: {
                    message: string;
                    location?: { start: { line: number; column: number } };
                }[];
            }
        ).diags?.[0];
        return failure([
            {
                severity: 'error',
                message:
                    diag?.message ??
                    (e instanceof Error ? e.message : 'Invalid DBML'),
                line: diag?.location?.start.line,
                column: diag?.location?.start.column,
            },
        ]);
    }

    const defaultSchema = dialect.defaultSchema;
    const schemaOf = (name: string | null | undefined): string | undefined =>
        !name || name === 'public' ? defaultSchema : name;
    const builder = new DesignBuilder({
        databaseType,
        name: options.name ?? 'DBML Import',
        now: options.now,
        random: options.random,
        sort: false,
    });

    for (const s of schemas)
        for (const e of s.enums)
            builder.addUserType({
                schema: schemaOf(s.name),
                name: e.name,
                kind: 'enum',
                values: e.values.map((v) => v.name),
            });

    // an enum is found by its written name in any letter case: the column's type
    // is lower-cased below, which would otherwise lose the link to `Status`
    const enumByLower = new Map<string, string>();
    for (const s of schemas)
        for (const e of s.enums) enumByLower.set(e.name.toLowerCase(), e.name);

    const allTables = schemas.flatMap((s) =>
        s.tables.map((t) => ({ t, schema: s.name }))
    );
    for (const { t, schema } of allTables) {
        const key = (f: string): string => `${t.name}.${f}`;
        const primary = new Set(
            t.fields.filter((f) => f.pk).map((f) => f.name)
        );
        const compositePk = t.indexes.find((i) => i.pk);
        if (compositePk)
            for (const c of compositePk.columns)
                if (c.type === 'column') primary.add(c.value);
        const columns: ColumnSpec[] = t.fields.map((f) => {
            const decl = parseTypeDeclaration(f.type.type_name) ?? {
                name: f.type.type_name,
            };
            const lower = decl.name.toLowerCase();
            const spec: ColumnSpec = {
                name: f.name,
                typeName:
                    enumByLower.get(lower) ??
                    dialect.typeSynonyms?.[lower] ??
                    lower,
                nullable: !(f.not_null || primary.has(f.name) || f.increment),
                primary: primary.has(f.name),
                unique: !!f.unique,
                numbered: f.increment ? true : undefined,
                isArray: prepared.arrayFields.has(key(f.name))
                    ? true
                    : undefined,
                comment: f.note ?? undefined,
            };
            if (decl.length !== undefined) spec.length = decl.length;
            if (decl.precision !== undefined) spec.precision = decl.precision;
            if (decl.scale !== undefined) spec.scale = decl.scale;
            if (f.dbdefault) spec.default = defaultText(f.dbdefault);
            return spec;
        });
        const names = new Set(columns.map((c) => c.name));
        const pkColumnNames = columns
            .filter((c) => c.primary)
            .map((c) => c.name);
        const indexes: IndexSpec[] = [];
        let primaryKeyName: string | undefined;
        for (const i of t.indexes) {
            const cols = i.columns
                .filter((c) => c.type === 'column')
                .map((c) => c.value);
            const missing = cols.find((c) => !names.has(c));
            if (missing !== undefined)
                return failure([
                    {
                        severity: 'error',
                        message: `Index references non-existent column: ${missing}`,
                    },
                ]);
            if (i.pk) {
                if (i.name) primaryKeyName = i.name;
                continue;
            }
            const samePk =
                pkColumnNames.length > 0 &&
                cols.length === pkColumnNames.length &&
                cols.every((c) => pkColumnNames.includes(c));
            if (samePk) continue;
            const method = i.type?.toLowerCase();
            indexes.push({
                name: i.name || `idx_${t.name}_${cols.join('_')}`,
                unique: !!i.unique,
                columns: cols,
                method: isKeyMethod(method) ? method : undefined,
                comment: i.note ?? undefined,
            });
        }
        const checks = [
            ...(t.checks ?? []).map((c) => c.expression),
            ...t.fields.flatMap((f) =>
                (prepared.fieldChecks.get(key(f.name)) ?? []).map(
                    (c) => c.expression
                )
            ),
        ];
        for (const expression of checks) {
            const problem = checkExpression(expression);
            if (problem)
                return failure([
                    {
                        severity: 'error',
                        message: `Invalid check on ${t.name}: ${problem.message}`,
                    },
                ]);
        }
        const spec: TableSpec = {
            name: t.name,
            schema: schemaOf(t.schemaName ?? schema),
            comment: t.note ?? undefined,
            columns,
            indexes,
            primaryKeyName,
            checks,
        };
        builder.addTable(spec);
    }

    for (const ref of schemas.flatMap((s) => s.refs)) {
        const [left, right] = ref.endpoints;
        const at = ref.token?.start;
        if (left.relation === '*' && right.relation === '*')
            return failure([
                {
                    severity: 'error',
                    message: `Many-to-many references (<>) are not supported: "${left.tableName}" and "${right.tableName}". Add a junction table that references both.`,
                    line: at?.line,
                    column: at?.column,
                },
            ]);
        const card = (r: string) =>
            r === '1' ? ('one' as const) : ('many' as const);
        left.fieldNames.forEach((field, i) => {
            const other = right.fieldNames[i];
            const ok = builder.addLink({
                name:
                    ref.name ||
                    `${left.tableName}_${field}_${right.tableName}_${other}`,
                cardinality: {
                    source: card(left.relation),
                    target: card(right.relation),
                },
                from: {
                    schema: schemaOf(left.schemaName ?? 'public'),
                    table: left.tableName,
                    column: field,
                },
                to: {
                    schema: schemaOf(right.schemaName ?? 'public'),
                    table: right.tableName,
                    column: other,
                },
            });
            if (!ok)
                diagnostics.push({
                    severity: 'error',
                    message: 'Invalid relationship: tables or fields not found',
                    line: at?.line,
                    column: at?.column,
                });
        });
    }
    if (diagnostics.some((d) => d.severity === 'error'))
        return failure(diagnostics);
    const design = builder.build();
    return {
        design,
        diagnostics,
        counts: {
            tables: design.entities.order.length,
            relationships: design.links.order.length,
        },
    };
}
