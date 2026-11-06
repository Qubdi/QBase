import type { Column } from './column';
import type { DatabaseType } from './database';
import { traitsOf } from './database';

/**
 * The text shown after a type name (data-format 3.4): `(len)` when a length is
 * set, else `(p, s)` when both precision and scale are non-zero, else `(p)`
 * when only precision is set, else nothing. Placeholders are not part of this.
 */
export function sizeSuffix(
    column: Pick<Column, 'length' | 'precision' | 'scale'>
): string {
    if (column.length !== undefined) return `(${column.length})`;
    const { precision, scale } = column;
    if (precision && scale) return `(${precision}, ${scale})`;
    if (precision) return `(${precision})`;
    return '';
}

/**
 * True when the array flag has an effect: the database supports arrays and
 * the type can be one (the caller knows the catalogue). Otherwise it is ignored.
 */
export function arrayApplies(
    column: Pick<Column, 'isArray'>,
    databaseType: DatabaseType,
    typeCanBeArray = true
): boolean {
    return (
        column.isArray === true &&
        typeCanBeArray &&
        traitsOf(databaseType).hasArrays
    );
}

/** Type name with its size and a `[]` suffix where the array flag applies. */
export function typeLabel(
    column: Pick<Column, 'type' | 'length' | 'precision' | 'scale' | 'isArray'>,
    databaseType: DatabaseType,
    typeCanBeArray = true
): string {
    return `${column.type.name}${sizeSuffix(column)}${
        arrayApplies(column, databaseType, typeCanBeArray) ? '[]' : ''
    }`;
}
