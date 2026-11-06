import { DATABASE_EDITIONS, DATABASE_TYPES } from '../model/database';
import { KEY_METHODS } from '../model/key';
import { isRecord } from './record-reader';
import type { RawRecord } from './record-reader';

type Kind = 'string' | 'number' | 'boolean' | 'strings' | readonly string[];

/** [kind, flags]: 'r' required (default), 'o' may be missing, 'n' may also be null. */
type Field = readonly [Kind, ('o' | 'n')?];
type Shape = Record<string, Field>;

const SHAPES: Record<string, Shape> = {
    table: {
        id: ['string'],
        name: ['string'],
        schema: ['string', 'n'],
        x: ['number'],
        y: ['number'],
        color: ['string'],
        isView: ['boolean'],
        isMaterializedView: ['boolean', 'n'],
        createdAt: ['number'],
        width: ['number', 'n'],
        comments: ['string', 'n'],
        order: ['number', 'n'],
        expanded: ['boolean', 'n'],
        parentAreaId: ['string', 'n'],
    },
    field: {
        id: ['string'],
        name: ['string'],
        primaryKey: ['boolean'],
        unique: ['boolean'],
        nullable: ['boolean'],
        increment: ['boolean', 'n'],
        isArray: ['boolean', 'n'],
        createdAt: ['number'],
        characterMaximumLength: ['string', 'n'],
        precision: ['number', 'n'],
        scale: ['number', 'n'],
        default: ['string', 'n'],
        collation: ['string', 'n'],
        comments: ['string', 'n'],
        check: ['string', 'n'],
    },
    index: {
        id: ['string'],
        name: ['string'],
        unique: ['boolean'],
        fieldIds: ['strings'],
        createdAt: ['number'],
        type: [KEY_METHODS, 'o'],
        isPrimaryKey: ['boolean', 'n'],
        comments: ['string', 'n'],
    },
    check: {
        id: ['string'],
        expression: ['string'],
        createdAt: ['number'],
    },
    relationship: {
        id: ['string'],
        name: ['string'],
        sourceSchema: ['string', 'n'],
        sourceTableId: ['string'],
        targetSchema: ['string', 'n'],
        targetTableId: ['string'],
        sourceFieldId: ['string'],
        targetFieldId: ['string'],
        sourceCardinality: [['one', 'many']],
        targetCardinality: [['one', 'many']],
        createdAt: ['number'],
    },
    dependency: {
        id: ['string'],
        schema: ['string', 'n'],
        tableId: ['string'],
        dependentSchema: ['string', 'n'],
        dependentTableId: ['string'],
        createdAt: ['number'],
    },
    customType: {
        id: ['string'],
        schema: ['string', 'n'],
        name: ['string'],
        kind: [['enum', 'composite']],
        values: ['strings', 'n'],
        order: ['number', 'n'],
    },
    area: {
        id: ['string'],
        name: ['string'],
        x: ['number'],
        y: ['number'],
        width: ['number'],
        height: ['number'],
        color: ['string'],
        order: ['number', 'o'],
    },
    note: {
        id: ['string'],
        content: ['string'],
        x: ['number'],
        y: ['number'],
        width: ['number'],
        height: ['number'],
        color: ['string'],
        order: ['number', 'o'],
    },
};

function matches(value: unknown, kind: Kind): boolean {
    if (Array.isArray(kind))
        return typeof value === 'string' && kind.includes(value);
    switch (kind) {
        case 'string':
            return typeof value === 'string';
        case 'number':
            return typeof value === 'number' && Number.isFinite(value);
        case 'boolean':
            return typeof value === 'boolean';
        case 'strings':
            return (
                Array.isArray(value) &&
                value.every((item) => typeof item === 'string')
            );
        default:
            return false;
    }
}

function checkShape(
    value: unknown,
    shape: Shape,
    path: string,
    errors: string[]
): value is RawRecord {
    if (!isRecord(value)) {
        errors.push(`${path}: expected an object`);
        return false;
    }
    for (const [key, [kind, flag]] of Object.entries(shape)) {
        const v = value[key];
        if (v === undefined) {
            if (flag === undefined) errors.push(`${path}.${key}: missing`);
            continue;
        }
        if (v === null) {
            if (flag !== 'n') errors.push(`${path}.${key}: must not be null`);
            continue;
        }
        if (!matches(v, kind))
            errors.push(`${path}.${key}: wrong type or value`);
    }
    return true;
}

function checkList(
    value: unknown,
    path: string,
    errors: string[],
    each: (item: unknown, itemPath: string) => void
): void {
    if (value === undefined || value === null) return;
    if (!Array.isArray(value)) {
        errors.push(`${path}: expected a list`);
        return;
    }
    value.forEach((item, i) => each(item, `${path}[${i}]`));
}

/**
 * Strict check of an imported file (DAT-067): required keys, value types and
 * enum values. Returns the problems found; an empty list means the file is
 * acceptable. Unknown keys are not a problem (DAT-068). Dates are not checked:
 * an import replaces them.
 */
export function validateDiagramFile(input: unknown): string[] {
    const errors: string[] = [];
    if (!isRecord(input)) return ['the file is not a diagram object'];
    const top: Shape = {
        id: ['string'],
        name: ['string'],
        databaseType: [DATABASE_TYPES],
        databaseEdition: [DATABASE_EDITIONS, 'o'],
    };
    checkShape(input, top, '', errors);

    checkList(input.tables, 'tables', errors, (table, path) => {
        if (!checkShape(table, SHAPES.table, path, errors)) return;
        if (!Array.isArray(table.fields))
            errors.push(`${path}.fields: missing`);
        checkList(table.fields, `${path}.fields`, errors, (field, fpath) => {
            if (!checkShape(field, SHAPES.field, fpath, errors)) return;
            const type = field.type;
            if (
                !isRecord(type) ||
                typeof type.id !== 'string' ||
                typeof type.name !== 'string'
            )
                errors.push(`${fpath}.type: expected {id, name}`);
        });
        if (!Array.isArray(table.indexes))
            errors.push(`${path}.indexes: missing`);
        checkList(table.indexes, `${path}.indexes`, errors, (index, ipath) =>
            checkShape(index, SHAPES.index, ipath, errors)
        );
        checkList(
            table.checkConstraints,
            `${path}.checkConstraints`,
            errors,
            (check, cpath) => checkShape(check, SHAPES.check, cpath, errors)
        );
    });
    checkList(input.relationships, 'relationships', errors, (rel, path) =>
        checkShape(rel, SHAPES.relationship, path, errors)
    );
    checkList(input.dependencies, 'dependencies', errors, (dep, path) =>
        checkShape(dep, SHAPES.dependency, path, errors)
    );
    checkList(input.customTypes, 'customTypes', errors, (type, path) => {
        if (!checkShape(type, SHAPES.customType, path, errors)) return;
        const members = type.fields;
        if (members === undefined || members === null) return;
        if (
            !Array.isArray(members) ||
            !members.every(
                (m) =>
                    isRecord(m) &&
                    typeof m.field === 'string' &&
                    typeof m.type === 'string'
            )
        )
            errors.push(`${path}.fields: expected a list of {field, type}`);
    });
    checkList(input.areas, 'areas', errors, (area, path) =>
        checkShape(area, SHAPES.area, path, errors)
    );
    checkList(input.notes, 'notes', errors, (note, path) =>
        checkShape(note, SHAPES.note, path, errors)
    );
    return errors;
}
