import type { Column, TypeRef } from '../model/column';
import { createColumn, createKey, createRule } from '../model/defaults';
import type { Design } from '../model/design';
import type { Id } from '../model/id';
import { entityOf, partsOf } from '../model/lookup';
import type { Key, KeyMethod } from '../model/key';
import {
    canUseGin,
    defaultMethodOf,
    INDEX_METHODS,
    methodProblem,
} from '../model/index-methods';
import type { MethodProblem } from '../model/index-methods';
import type { Command, Patch } from './command';
import type { PlanOptions } from './plan-entity';

/** Appends `field_N` with the default type (EDT-117). */
export function planAddColumn(
    design: Design,
    entityId: Id,
    options: PlanOptions & Partial<Column> = {}
): Command | undefined {
    const entity = entityOf(design, entityId);
    if (!entity) return undefined;
    return {
        type: 'part.insert',
        entityId,
        part: 'columns',
        item: createColumn(design, entity.columnIds.length, {
            taken: entity.columnIds.map((id) => design.columns[id]?.name ?? ''),
            ...options,
        }),
    };
}

export function planDeleteColumn(entityId: Id, columnId: Id): Command {
    return { type: 'part.remove', entityId, part: 'columns', id: columnId };
}

export function planUpdateColumn(
    entityId: Id,
    columnId: Id,
    patch: Patch<Column>
): Command {
    return {
        type: 'part.update',
        entityId,
        part: 'columns',
        id: columnId,
        patch,
    };
}

/** What the new type can carry, as known by the type catalogue. */
export interface TypeCapabilities {
    hasLength: boolean;
    hasPrecisionScale: boolean;
    allowsArray: boolean;
}

/**
 * Changes a column's type (EDT-123): size, precision and scale stay only if
 * the new type has them, the array flag only if it allows arrays, and the
 * default value is always cleared. The serial family is settled by `apply`.
 */
export function planChangeColumnType(
    entityId: Id,
    columnId: Id,
    type: TypeRef,
    capabilities: TypeCapabilities,
    carried: Pick<Column, 'length' | 'precision' | 'scale' | 'isArray'> = {}
): Command {
    return planUpdateColumn(entityId, columnId, {
        type,
        default: undefined,
        length: capabilities.hasLength ? carried.length : undefined,
        precision: capabilities.hasPrecisionScale
            ? carried.precision
            : undefined,
        scale: capabilities.hasPrecisionScale ? carried.scale : undefined,
        isArray: capabilities.allowsArray ? carried.isArray : undefined,
    });
}

export function planReorderColumns(entityId: Id, columnIds: Id[]): Command {
    return { type: 'part.reorder', entityId, part: 'columns', ids: columnIds };
}

// ------------------------------------------------------------------------ indexes

export { canUseGin };

/** The index types a database offers for a choice (DAT-044). */
export function offeredKeyMethods(
    databaseType: Design['databaseType']
): KeyMethod[] {
    return [...INDEX_METHODS[databaseType]];
}

/** The type of an index, as the database would take it with these columns and neighbours. */
export function indexMethodProblem(
    design: Design,
    entityId: Id,
    key: Key,
    method: KeyMethod,
    patch: Partial<Key> = {}
): MethodProblem | undefined {
    const entity = entityOf(design, entityId);
    if (!entity) return undefined;
    const parts = partsOf(design, entity);
    const members = patch.members ?? key.members;
    return methodProblem(
        design.databaseType,
        method,
        parts.columns.filter((c) => members.includes(c.id)),
        patch.distinct ?? key.distinct,
        {
            others: parts.keys.filter((k) => k.id !== key.id),
            hasPrimaryKey: parts.keys.some((k) => k.pk),
        }
    );
}

/** `index_N` with no columns, not unique; `btree` where the database has a choice (EDT-141). */
export function planAddKey(
    design: Design,
    entityId: Id,
    options: PlanOptions & Partial<Key> = {}
): Command | undefined {
    const entity = entityOf(design, entityId);
    if (!entity || entity.kind === 'view') return undefined;
    const method = defaultMethodOf(design.databaseType);
    return {
        type: 'part.insert',
        entityId,
        part: 'keys',
        item: createKey(entity.keyIds.length, {
            taken: entity.keyIds.map((id) => design.keys[id]?.label ?? ''),
            ...(method ? { algorithm: method } : {}),
            ...options,
        }),
    };
}

/**
 * Changes an index. A type that the database would refuse for the new columns
 * or the new unique flag is reset to the database's first type (EDT-144).
 */
export function planUpdateKey(
    design: Design,
    entityId: Id,
    keyId: Id,
    change: Partial<Key>
): Command | undefined {
    const entity = entityOf(design, entityId);
    const key = design.keys[keyId];
    if (!entity || !key) return undefined;
    const patch: Patch<Key> = { ...change };
    const method = change.algorithm ?? key.algorithm;
    const changesWhatMatters =
        change.members !== undefined || change.distinct !== undefined;
    if (
        method &&
        changesWhatMatters &&
        change.algorithm === undefined &&
        indexMethodProblem(design, entityId, key, method, change)
    )
        patch.algorithm = defaultMethodOf(design.databaseType);
    return { type: 'part.update', entityId, part: 'keys', id: keyId, patch };
}

/** Sets the columns of an index (see `planUpdateKey`). */
export function planSetKeyColumns(
    design: Design,
    entityId: Id,
    keyId: Id,
    columnIds: Id[]
): Command | undefined {
    return planUpdateKey(design, entityId, keyId, { members: columnIds });
}

/** A new, empty check constraint (EDT-148). */
export function planAddRule(entityId: Id, options: PlanOptions = {}): Command {
    return {
        type: 'part.insert',
        entityId,
        part: 'rules',
        item: createRule(options),
    };
}
