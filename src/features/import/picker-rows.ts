import type { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';

/** More than this many tables and views asks which ones to bring in (IMP-064). */
export const PICKER_THRESHOLD = 50;
/** The most that can be picked at once. */
export const PICKER_LIMIT = 500;
export interface PickerRow {
    key: string;
    schema: string;
    name: string;
    view: boolean;
}

/** `schema.name` keys of every table and view in the metadata. */
export function pickerRows(metadata: DatabaseMetadata): PickerRow[] {
    return [
        ...metadata.tables.map((t) => ({
            key: `${t.schema}.${t.table}`,
            schema: t.schema,
            name: t.table,
            view: false,
        })),
        ...metadata.views.map((v) => ({
            key: `${v.schema}.${v.view_name}`,
            schema: v.schema,
            name: v.view_name,
            view: true,
        })),
    ];
}

/** Every table (not view) when there are fewer than the limit, otherwise the first `limit`. */
export function defaultSelection(rows: readonly PickerRow[]): Set<string> {
    return new Set(
        rows
            .filter((r) => !r.view)
            .slice(0, PICKER_LIMIT)
            .map((r) => r.key)
    );
}
