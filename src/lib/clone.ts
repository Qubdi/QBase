import type { DBTable } from '@/qbase/diagram-types';
import { generateId } from './utils/utils';

/**
 * A copy of a saved-shape table that shares no id with the original: the
 * table, each field and each index get a new id, and an index keeps pointing
 * at the copy's own fields. The index that stands in for the primary key loses
 * its name, so the database picks one.
 */
export function cloneTable(table: DBTable): DBTable {
    const fieldIds = new Map<string, string>();
    const fields = table.fields.map((field) => {
        const id = generateId();
        fieldIds.set(field.id, id);
        return { ...field, id };
    });
    const indexes = table.indexes.map((index) => ({
        ...index,
        id: generateId(),
        ...(index.isPrimaryKey ? { name: '' } : {}),
        fieldIds: index.fieldIds.map((id) => fieldIds.get(id) ?? id),
    }));
    const checkConstraints = table.checkConstraints?.map((check) => ({
        ...check,
        id: generateId(),
    }));
    return {
        ...table,
        id: generateId(),
        fields,
        indexes,
        ...(checkConstraints ? { checkConstraints } : {}),
    };
}
