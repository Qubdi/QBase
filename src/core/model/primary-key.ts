import { idFromSeed } from './ids';
import type { Column } from './column';
import type { EntityParts } from './entity-parts';
import type { Key } from './key';

/**
 * Brings the primary-key index of an entity in line with its columns
 * (data-format 3.5): it lists exactly the columns marked as primary key, in
 * column order, and sits first. No primary-key columns means no such index.
 * A primary-key column can never be nullable; that is repaired here too.
 * Views have no indexes and are returned unchanged. The result is
 * deterministic: a new index gets an id derived from the entity id.
 */
export function syncPrimaryKey(
    parts: EntityParts,
    isTaken: (id: string) => boolean = () => false
): EntityParts {
    const { entity } = parts;
    if (entity.kind === 'view') return parts;

    const columns: Column[] = parts.columns.map((column) =>
        column.primaryKey && column.nullable
            ? { ...column, nullable: false }
            : column
    );
    const primaryIds = columns
        .filter((column) => column.primaryKey)
        .map((column) => column.id);

    const existing = parts.keys.find((key) => key.pk === true);
    let keys: Key[];
    if (primaryIds.length === 0) {
        keys = parts.keys.filter((key) => key.pk !== true);
    } else if (existing) {
        const updated: Key = sameIds(existing.members, primaryIds)
            ? existing
            : { ...existing, members: primaryIds };
        keys = [updated, ...parts.keys.filter((key) => key !== existing)];
    } else {
        let id = idFromSeed(`${entity.id}/primary`);
        for (let n = 1; isTaken(id); n++)
            id = idFromSeed(`${entity.id}/primary/${n}`);
        keys = [
            {
                id,
                label: '',
                distinct: true,
                members: primaryIds,
                pk: true,
                madeAt: entity.createdAt,
            },
            ...parts.keys,
        ];
    }

    const columnsChanged = columns.some((c, i) => c !== parts.columns[i]);
    const keysChanged =
        keys.length !== parts.keys.length ||
        keys.some((k, i) => k !== parts.keys[i]);
    if (!columnsChanged && !keysChanged) return parts;
    const keyIds = keys.map((key) => key.id);
    return {
        entity: sameIds(keyIds, entity.keyIds) ? entity : { ...entity, keyIds },
        columns: columnsChanged ? columns : parts.columns,
        keys,
        rules: parts.rules,
    };
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id, i) => id === b[i]);
}
