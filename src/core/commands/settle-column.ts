import type { Column } from '../model/column';
import type { Patch } from './command';
import { applyPatch } from './patch';

const SERIAL_TYPES = ['serial', 'smallserial', 'bigserial'];

/** True for the serial family: not null and auto-increment, always. */
export function isSerialType(typeId: string): boolean {
    return SERIAL_TYPES.includes(typeId.toLowerCase());
}

/**
 * Applies a patch to a column and the rules that follow from it (editor 4.5,
 * 4.7, 4.8): a primary-key column is not null; the first primary key of a
 * table is also unique; the serial family is not null with auto-increment;
 * turning nullable on clears auto-increment.
 */
export function settleColumn(
    column: Column,
    patch: Patch<Column>,
    otherColumnsHavePrimaryKey: boolean
): Column {
    let next = applyPatch(column, patch);
    if (next === column) return column;
    const set: Patch<Column> = {};

    if (
        next.primaryKey &&
        !column.primaryKey &&
        !otherColumnsHavePrimaryKey &&
        !('unique' in patch)
    )
        set.unique = true;
    if (next.primaryKey && next.nullable) set.nullable = false;
    if (isSerialType(next.type.id)) {
        if (next.nullable) set.nullable = false;
        if (next.increment !== true) set.increment = true;
    } else if (
        patch.nullable === true &&
        next.nullable &&
        next.increment === true
    ) {
        set.increment = false;
    }
    next = applyPatch(next, set);
    return next;
}
