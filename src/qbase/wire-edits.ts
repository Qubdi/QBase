import type { Patch } from '@/core/commands/command';
import type { Column } from '@/core/model/column';
import type { Entity } from '@/core/model/entity';
import { isKeyMethod } from '@/core/model/key';
import type { Key } from '@/core/model/key';
import { readLength } from '@/core/wire/parse';
import type { DBField, DBIndex, DBTable } from './diagram-types';

/** `null` on the wire means "not set": the model drops the key. */
const unset = <T>(value: T | null | undefined): T | undefined =>
    value ?? undefined;

/** The index of a saved diagram as the model's key. */
export function keyFromIndex(index: DBIndex): Key {
    return {
        id: index.id,
        label: index.name,
        members: [...index.fieldIds],
        distinct: index.unique,
        madeAt: index.createdAt,
        ...(index.type !== undefined && isKeyMethod(index.type)
            ? { algorithm: index.type }
            : {}),
        ...(index.isPrimaryKey ? { pk: true } : {}),
        ...(index.comments ? { note: index.comments } : {}),
    };
}

/** A change to a saved column, as a change to the model's column. */
export function columnPatchFromWire(patch: Partial<DBField>): Patch<Column> {
    const out: Patch<Column> = {};
    if (patch.name !== undefined) out.name = patch.name;
    if ('type' in patch && patch.type)
        out.type = { id: patch.type.id, name: patch.type.name };
    if (patch.primaryKey !== undefined) out.primaryKey = patch.primaryKey;
    if (patch.unique !== undefined) out.unique = patch.unique;
    if (patch.nullable !== undefined) out.nullable = patch.nullable;
    if ('increment' in patch) out.increment = unset(patch.increment);
    if ('isArray' in patch) out.isArray = unset(patch.isArray);
    if ('characterMaximumLength' in patch) {
        const length = readLength(patch.characterMaximumLength);
        out.length = length === 'bad' ? undefined : length;
    }
    if ('precision' in patch) out.precision = unset(patch.precision);
    if ('scale' in patch) out.scale = unset(patch.scale);
    if ('default' in patch) out.default = unset(patch.default);
    if ('collation' in patch) out.collation = unset(patch.collation);
    if ('comments' in patch) out.comments = unset(patch.comments);
    if ('check' in patch) out.check = unset(patch.check);
    return out;
}

/** Keys of a saved table that are edited through their own operations. */
const OWNED_BY_OTHER_OPERATIONS = [
    'fields',
    'indexes',
    'checkConstraints',
    'order',
] as const;

/** A change to a saved table, as a change to the model's entity. */
export function entityPatchFromWire(
    patch: Partial<DBTable>
): Patch<Omit<Entity, 'columnIds' | 'keyIds' | 'ruleIds'>> {
    for (const key of OWNED_BY_OTHER_OPERATIONS)
        if (key in patch) throw new Error(`updateTable cannot change "${key}"`);
    const out: Patch<Omit<Entity, 'columnIds' | 'keyIds' | 'ruleIds'>> = {};
    if (patch.name !== undefined) out.name = patch.name;
    if ('schema' in patch) out.schema = unset(patch.schema);
    if (patch.x !== undefined) out.x = patch.x;
    if (patch.y !== undefined) out.y = patch.y;
    if (patch.color !== undefined) out.color = patch.color;
    if (patch.isView !== undefined) out.kind = patch.isView ? 'view' : 'table';
    if ('isMaterializedView' in patch)
        out.materialized = unset(patch.isMaterializedView);
    if (patch.createdAt !== undefined) out.createdAt = patch.createdAt;
    if ('width' in patch) out.width = unset(patch.width);
    if ('comments' in patch) out.comments = unset(patch.comments);
    if ('expanded' in patch) out.expanded = unset(patch.expanded);
    if ('parentAreaId' in patch) out.regionId = unset(patch.parentAreaId);
    return out;
}
