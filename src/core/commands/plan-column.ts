import type { Column, TypeRef } from '../model/column';
import { createColumn, createKey, createRule } from '../model/defaults';
import type { Design } from '../model/design';
import type { Id } from '../model/id';
import { entityOf, partsOf } from '../model/lookup';
import type { Key, KeyMethod } from '../model/key';
import { traitsOf } from '../model/database';
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

const GIN_TYPES = ['jsonb', 'json', 'tsvector', 'hstore'];

/** Whether `gin` may be used on these columns (DAT-044). */
export function canUseGin(columns: readonly Column[]): boolean {
    return (
        columns.length > 0 &&
        columns.every(
            (c) =>
                c.isArray === true ||
                GIN_TYPES.includes(c.type.id.toLowerCase())
        )
    );
}

/** The index methods a database offers for a choice (DAT-044). */
export function offeredKeyMethods(
    databaseType: Design['databaseType']
): KeyMethod[] {
    return traitsOf(databaseType).hasIndexMethods
        ? ['btree', 'hash', 'gin']
        : [];
}

/** `index_N` with no columns, not unique; `btree` where the database has a choice (EDT-141). */
export function planAddKey(
    design: Design,
    entityId: Id,
    options: PlanOptions & Partial<Key> = {}
): Command | undefined {
    const entity = entityOf(design, entityId);
    if (!entity || entity.kind === 'view') return undefined;
    const method = traitsOf(design.databaseType).hasIndexMethods
        ? ('btree' as const)
        : undefined;
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
 * Sets the columns of an index. A `gin` method that no longer fits the chosen
 * columns is reset to `btree` (EDT-144).
 */
export function planSetKeyColumns(
    design: Design,
    entityId: Id,
    keyId: Id,
    columnIds: Id[]
): Command | undefined {
    const entity = entityOf(design, entityId);
    const key = design.keys[keyId];
    if (!entity || !key) return undefined;
    const patch: Patch<Key> = { members: columnIds };
    if (key.algorithm === 'gin') {
        const parts = partsOf(design, entity);
        const chosen = parts.columns.filter((c) => columnIds.includes(c.id));
        if (!canUseGin(chosen)) patch.algorithm = 'btree';
    }
    return { type: 'part.update', entityId, part: 'keys', id: keyId, patch };
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
