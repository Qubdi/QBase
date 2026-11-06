import type { DatabaseMetadata } from './types.js';

/**
 * Keeps only the chosen tables ("schema.table"). Foreign keys survive only
 * when both ends are kept, so the diagram never points at a missing table.
 * An undefined or empty selection keeps everything.
 */
export function filterMetadata(
    metadata: DatabaseMetadata,
    selected: string[] | undefined
): DatabaseMetadata {
    if (!selected || selected.length === 0) return metadata;
    const keep = new Set(selected);
    const key = (schema: string, table: string) => `${schema}.${table}`;
    const has = (schema: string, table: string) => keep.has(key(schema, table));

    return {
        ...metadata,
        tables: metadata.tables.filter((t) => has(t.schema, t.table)),
        views: metadata.views.filter((v) => has(v.schema, v.view_name)),
        columns: metadata.columns.filter((c) => has(c.schema, c.table)),
        pk_info: metadata.pk_info.filter((p) => has(p.schema, p.table)),
        indexes: metadata.indexes.filter((i) => has(i.schema, i.table)),
        check_constraints: metadata.check_constraints?.filter((c) =>
            has(c.schema, c.table)
        ),
        fk_info: metadata.fk_info.filter(
            (f) =>
                has(f.schema, f.table) &&
                has(f.reference_schema ?? f.schema, f.reference_table)
        ),
    };
}
