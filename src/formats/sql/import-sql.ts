import type { DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import type { RandomInt } from '@/core/model/ids';
import { dialectFor } from '@/dialects/registry';
import type {
    Diagnostic,
    ScriptResult,
    ScriptTable,
} from '@/dialects/script-model';
import { resolveTable, sameName } from '@/dialects/shared/names';
import { DesignBuilder } from '../shared/design-builder';
import type { IndexSpec, TableSpec } from '../shared/design-builder';
import { error, hasErrors, warning } from './diagnostics';

export interface SqlImportOptions {
    now?: number;
    random?: RandomInt;
    name?: string;
}

export interface SqlImportResult {
    /** undefined when an error blocks the import or there is nothing to import */
    design?: Design;
    diagnostics: Diagnostic[];
    counts: { tables: number; views: number; relationships: number };
}

const NONE = { tables: 0, views: 0, relationships: 0 };

/** Which table each standalone index belongs to (a miss is reported once). */
function indexesByTable(
    script: ScriptResult,
    diagnostics: Diagnostic[]
): Map<ScriptTable, ScriptResult['indexes']> {
    const out = new Map<ScriptTable, ScriptResult['indexes']>();
    for (const index of script.indexes) {
        const { found, ambiguous } = resolveTable(
            script.tables,
            (t) => t,
            index.table
        );
        const shown = index.table.schema
            ? `${index.table.schema}.${index.table.name}`
            : index.table.name;
        if (!found) {
            diagnostics.push(
                warning(
                    `Index ${index.name} ignored: table ${shown} is not in the script.`
                )
            );
            continue;
        }
        if (ambiguous)
            diagnostics.push(
                warning(
                    `Index ${index.name} names ${shown} without a schema and several schemas have it: the first was used.`
                )
            );
        out.set(found, [...(out.get(found) ?? []), index]);
    }
    return out;
}

function tableSpec(
    table: ScriptTable,
    mine: ScriptResult['indexes']
): TableSpec {
    const indexes: IndexSpec[] = mine.map((i) => ({
        name: i.name,
        unique: i.unique,
        columns: i.columns,
        descending: i.descending,
        where: i.where,
        method: i.method,
    }));
    const columns = table.columns.map((c) => ({
        ...c,
        nullable: c.nullable,
        unique: c.unique,
    }));
    for (const index of indexes) {
        // a partial unique index does not make the column unique
        if (!index.unique || index.columns.length !== 1 || index.where)
            continue;
        const col = columns.find((c) => sameName(c.name, index.columns[0]));
        if (col) col.unique = true;
    }
    for (const key of table.uniqueKeys) {
        if (key.columns.length === 1) {
            const col = columns.find((c) => sameName(c.name, key.columns[0]));
            if (col) col.unique = true;
        } else if (key.columns.length > 1) {
            indexes.push({
                name: key.name ?? `${table.name}_${key.columns.join('_')}_key`,
                unique: true,
                columns: key.columns,
            });
        }
    }
    return {
        name: table.name,
        schema: table.schema,
        view: table.view,
        materialized: table.materialized,
        comment: table.comment,
        columns,
        primaryKeyName: table.primaryKey?.name,
        indexes,
        checks: table.checks,
    };
}

/** Builds a design from a script read by a dialect (IMP-018 to IMP-044). */
export function designFromScript(
    script: ScriptResult,
    databaseType: DatabaseType,
    options: SqlImportOptions = {}
): { design: Design; diagnostics: Diagnostic[] } {
    const diagnostics: Diagnostic[] = [];
    const builder = new DesignBuilder({
        databaseType,
        name: options.name ?? `SQL Import (${dialectFor(databaseType).label})`,
        now: options.now,
        random: options.random,
    });
    for (const e of script.enums)
        builder.addUserType({
            schema: e.schema,
            name: e.name,
            kind: 'enum',
            values: e.values,
        });
    const mineByTable = indexesByTable(script, diagnostics);
    for (const table of script.tables) {
        if (builder.hasTable(table.schema, table.name)) {
            diagnostics.push(
                warning(
                    `Table ${table.name} is defined twice: the second definition was ignored.`
                )
            );
            continue;
        }
        builder.addTable(tableSpec(table, mineByTable.get(table) ?? []));
    }
    for (const fk of script.foreignKeys) {
        const holderSchema = fk.table.schema;
        // an unqualified target prefers the schema of the holding table
        const refSchema =
            fk.refTable.schema ??
            (builder.hasTable(holderSchema, fk.refTable.name)
                ? holderSchema
                : undefined);
        if (!builder.resolves(refSchema, fk.refTable.name)) {
            diagnostics.push(
                warning(
                    `Foreign key on ${fk.table.name} dropped: table ${fk.refTable.name} is not in the script.`
                )
            );
            continue;
        }
        const refColumns = fk.refColumns.length
            ? fk.refColumns
            : builder.primaryColumns(refSchema, fk.refTable.name);
        if (refColumns.length !== fk.columns.length) {
            diagnostics.push(
                warning(
                    `Foreign key on ${fk.table.name} dropped: its columns do not match.`
                )
            );
            continue;
        }
        fk.columns.forEach((column, i) => {
            const name = fk.name ?? `fk_${fk.table.name}_${column}`;
            const ok = builder.addLink({
                name,
                from: {
                    schema: refSchema,
                    table: fk.refTable.name,
                    column: refColumns[i],
                },
                to: { schema: holderSchema, table: fk.table.name, column },
            });
            if (!ok)
                diagnostics.push(
                    warning(
                        `Foreign key ${name} dropped: a table or column is missing.`
                    )
                );
        });
    }
    const design = builder.build();
    return { design, diagnostics: [...diagnostics, ...builder.diagnostics] };
}

/** Reads SQL text for a dialect and builds a design (IMP-008 to IMP-044). */
export function importSql(
    text: string,
    dialectId: DatabaseType,
    options: SqlImportOptions = {}
): SqlImportResult {
    const dialect = dialectFor(dialectId);
    const read = dialect.sql.read;
    if (!read)
        return {
            diagnostics: [error('Unsupported database type')],
            counts: NONE,
        };
    const script = read(text);
    const diagnostics = [...script.diagnostics];
    const counts = {
        tables: script.tables.filter((t) => !t.view).length,
        views: script.tables.filter((t) => t.view).length,
        relationships: 0,
    };
    if (hasErrors(diagnostics)) return { diagnostics, counts };
    if (script.tables.length === 0) {
        diagnostics.push(warning('Nothing to import'));
        return { diagnostics, counts };
    }
    const built = designFromScript(script, dialectId, options);
    counts.relationships = built.design.links.order.length;
    return {
        design: built.design,
        diagnostics: [...diagnostics, ...built.diagnostics],
        counts,
    };
}
