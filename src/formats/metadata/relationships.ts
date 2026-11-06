import type { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import type { LinkSpec } from '../shared/design-builder';

export interface TableLookup {
    /** true when the table (schema may be empty) has the column */
    hasColumn(
        schema: string | undefined,
        table: string,
        column: string
    ): boolean;
}

const blank = (schema: string | null | undefined): string | undefined =>
    schema && schema.trim() !== '' ? schema : undefined;

/**
 * One link per foreign-key row (IMP-063). The referenced side is the source;
 * a row whose table or column is unknown is dropped (and counted by the
 * caller through the length difference).
 */
export function createRelationshipsFromMetadata(
    foreignKeys: DatabaseMetadata['fk_info'],
    known: TableLookup
): LinkSpec[] {
    const out: LinkSpec[] = [];
    for (const fk of foreignKeys) {
        const holder = blank(fk.schema);
        const referenced = blank(fk.reference_schema) ?? holder;
        if (
            !known.hasColumn(holder, fk.table, fk.column) ||
            !known.hasColumn(
                referenced,
                fk.reference_table,
                fk.reference_column
            )
        )
            continue;
        out.push({
            name: fk.foreign_key_name,
            from: {
                schema: referenced,
                table: fk.reference_table,
                column: fk.reference_column,
            },
            to: { schema: holder, table: fk.table, column: fk.column },
        });
    }
    return out;
}
