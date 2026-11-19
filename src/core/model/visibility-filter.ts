import type { Entity } from './entity';

/**
 * Which entities the person chose to show (data-format 3.12). Absent keys
 * mean "not restricted". Saved with the diagram (`filter` key, omitted when
 * everything is shown).
 */
export interface VisibilityFilter {
    schemaIds?: string[];
    tableIds?: string[];
}

/** A schema id is the name trimmed, lower-cased, spaces turned into `_`. */
export function schemaIdOf(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, '_');
}

function entitySchemaId(
    entity: Pick<Entity, 'schema'>,
    defaultSchema: string | undefined
): string | undefined {
    const name = entity.schema?.trim() ? entity.schema : defaultSchema;
    return name && name.trim() ? schemaIdOf(name) : undefined;
}

/** Union logic: shown if its id is listed, or its schema is listed. */
export function isVisible(
    filter: VisibilityFilter,
    entity: Pick<Entity, 'id' | 'schema'>,
    defaultSchema?: string
): boolean {
    if (filter.schemaIds === undefined && filter.tableIds === undefined)
        return true;
    if (filter.tableIds?.includes(entity.id)) return true;
    const schemaId = entitySchemaId(entity, defaultSchema);
    return (
        schemaId !== undefined && (filter.schemaIds ?? []).includes(schemaId)
    );
}

/**
 * Tidies a filter before it is saved: tables whose schema is already listed
 * leave `tableIds`; a schema whose tables are all listed moves to `schemaIds`;
 * if that shows everything, both keys go.
 */
export function tidyFilter(
    filter: VisibilityFilter,
    entities: readonly Pick<Entity, 'id' | 'schema'>[],
    defaultSchema?: string
): VisibilityFilter {
    if (filter.schemaIds === undefined && filter.tableIds === undefined)
        return {};
    const schemas = new Set(filter.schemaIds ?? []);
    let tableIds = new Set(filter.tableIds ?? []);

    for (const id of [...tableIds]) {
        const entity = entities.find((e) => e.id === id);
        const schemaId = entity && entitySchemaId(entity, defaultSchema);
        if (schemaId !== undefined && schemas.has(schemaId))
            tableIds.delete(id);
    }

    const bySchema = new Map<string, string[]>();
    for (const entity of entities) {
        const schemaId = entitySchemaId(entity, defaultSchema);
        if (schemaId === undefined) continue;
        bySchema.set(schemaId, [...(bySchema.get(schemaId) ?? []), entity.id]);
    }
    for (const [schemaId, ids] of bySchema) {
        if (!schemas.has(schemaId) && ids.every((id) => tableIds.has(id))) {
            schemas.add(schemaId);
            tableIds = new Set([...tableIds].filter((id) => !ids.includes(id)));
        }
    }

    const tidy: VisibilityFilter = {};
    if (schemas.size > 0) tidy.schemaIds = [...schemas];
    if (tableIds.size > 0 || schemas.size === 0) tidy.tableIds = [...tableIds];
    if (entities.every((entity) => isVisible(tidy, entity, defaultSchema)))
        return {};
    return tidy;
}

/** True when the filter restricts nothing (no keys set). */
export function isUnrestricted(filter: VisibilityFilter | undefined): boolean {
    return (
        filter === undefined ||
        (filter.schemaIds === undefined && filter.tableIds === undefined)
    );
}
