import { knownTypes } from '@/qbase/type-catalogue';
import {
    type DBField,
    type DBIndex,
    type DBTable,
    type DatabaseType,
} from '@/qbase/diagram-types';
import { generateId } from '@/lib/utils';
import { canonicalType } from '../../../shared/schema-desc';
import type { LintFix } from '../../../shared/lint';

/** One change the editor performs through its own (undoable) operations. */
export type FixOp =
    | { kind: 'addIndex'; tableId: string; index: DBIndex }
    | { kind: 'removeIndex'; tableId: string; indexId: string }
    | {
          kind: 'updateField';
          tableId: string;
          fieldId: string;
          patch: Partial<DBField>;
      }
    | { kind: 'updateTable'; tableId: string; patch: Partial<DBTable> };

/** QBase's own data type for a canonical type name, with a faithful fallback. */
export function resolveDataType(
    databaseType: DatabaseType,
    typeName: string
): { id: string; name: string } {
    const wanted = canonicalType(typeName);
    const known = knownTypes(databaseType).find(
        (t) => canonicalType(t.name) === wanted
    );
    return known
        ? { id: known.id, name: known.name }
        : { id: typeName.toLowerCase().split(' ').join('_'), name: typeName };
}

/**
 * Turns a lint fix into editor operations, or null when the diagram no longer
 * matches what the finding saw (it was edited since). Pure.
 */
export function planFix(
    fix: LintFix,
    tables: DBTable[],
    databaseType: DatabaseType
): FixOp[] | null {
    const table = tables.find((t) => t.id === fix.tableId);
    if (!table) return null;
    const fieldIn = (id?: string) => table.fields.find((f) => f.id === id);

    switch (fix.action) {
        case 'add_index': {
            const known = fix.columnIds.every((id) => fieldIn(id));
            if (!known) return null;
            // never create a second copy if someone already added it
            const existing = table.indexes.some(
                (ix) => ix.fieldIds.join(',') === fix.columnIds.join(',')
            );
            if (existing) return null;
            return [
                {
                    kind: 'addIndex',
                    tableId: table.id,
                    index: {
                        id: generateId(),
                        name: fix.indexName,
                        unique: false,
                        fieldIds: fix.columnIds,
                        createdAt: Date.now(),
                    },
                },
            ];
        }
        case 'remove_index':
            return table.indexes.some((ix) => ix.id === fix.indexId)
                ? [
                      {
                          kind: 'removeIndex',
                          tableId: table.id,
                          indexId: fix.indexId!,
                      },
                  ]
                : null;
        case 'set_column_type': {
            const f = fieldIn(fix.columnId);
            if (!f) return null;
            return [
                {
                    kind: 'updateField',
                    tableId: table.id,
                    fieldId: f.id,
                    patch: {
                        type: resolveDataType(databaseType, fix.typeName),
                    },
                },
            ];
        }
        case 'set_column_length': {
            const f = fieldIn(fix.columnId);
            if (!f) return null;
            return [
                {
                    kind: 'updateField',
                    tableId: table.id,
                    fieldId: f.id,
                    patch: { characterMaximumLength: fix.length },
                },
            ];
        }
        case 'rename_table': {
            const clash = tables.some(
                (t) =>
                    t.id !== table.id &&
                    (t.schema ?? '') === (table.schema ?? '') &&
                    t.name.toLowerCase() === fix.to.toLowerCase()
            );
            return clash
                ? null
                : [
                      {
                          kind: 'updateTable',
                          tableId: table.id,
                          patch: { name: fix.to },
                      },
                  ];
        }
        case 'rename_column': {
            const f = fieldIn(fix.columnId);
            if (!f) return null;
            const clash = table.fields.some(
                (x) =>
                    x.id !== f.id &&
                    x.name.toLowerCase() === fix.to.toLowerCase()
            );
            return clash
                ? null
                : [
                      {
                          kind: 'updateField',
                          tableId: table.id,
                          fieldId: f.id,
                          patch: { name: fix.to },
                      },
                  ];
        }
    }
}
