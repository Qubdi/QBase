import type { Command } from '@/core/commands/command';
import { traitsOf } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import type { Entity } from '@/core/model/entity';
import { entityList } from '@/core/model/lookup';
import { isVisible, schemaIdOf } from '@/core/model/visibility-filter';
import type { VisibilityFilter } from '@/core/model/visibility-filter';
import { reorderedIds } from './fields/field-rules';

/** True when `name` contains `text`, ignoring case; empty text matches all. */
export function nameMatches(name: string, text: string): boolean {
    const needle = text.trim().toLowerCase();
    return needle === '' || name.toLowerCase().includes(needle);
}

export interface TableListInput {
    design: Design;
    filter: VisibilityFilter;
    /** View > Database Views */
    showViews: boolean;
    text?: string;
}

/**
 * The rows of the Tables list (EDT-103 to EDT-109): the design's own order,
 * narrowed by the visibility filter, the Database Views switch and the text.
 */
export function listTables({
    design,
    filter,
    showViews,
    text = '',
}: TableListInput): Entity[] {
    const defaultSchema = traitsOf(design.databaseType).defaultSchema;
    return entityList(design).filter(
        (entity) =>
            (showViews || entity.kind !== 'view') &&
            isVisible(filter, entity, defaultSchema) &&
            nameMatches(entity.name, text)
    );
}

/** The names of the schemas the listed tables belong to, once each, in order. */
export function visibleSchemas(
    design: Design,
    filter: VisibilityFilter,
    showViews: boolean
): string[] {
    const traits = traitsOf(design.databaseType);
    if (!traits.hasSchemas) return [];
    const seen = new Map<string, string>();
    for (const entity of listTables({ design, filter, showViews })) {
        const name = entity.schema?.trim()
            ? entity.schema
            : traits.defaultSchema;
        if (name && !seen.has(schemaIdOf(name)))
            seen.set(schemaIdOf(name), name);
    }
    return [...seen.values()];
}

/** Every schema named anywhere in the design plus the database default. */
export function knownSchemas(design: Design): string[] {
    const traits = traitsOf(design.databaseType);
    if (!traits.hasSchemas) return [];
    const seen = new Map<string, string>();
    const add = (name: string | undefined) => {
        if (name?.trim() && !seen.has(schemaIdOf(name)))
            seen.set(schemaIdOf(name), name);
    };
    add(traits.defaultSchema);
    for (const entity of entityList(design)) add(entity.schema);
    for (const type of design.userTypes.order)
        add(design.userTypes.byId[type].schema);
    return [...seen.values()];
}

/**
 * Dragging a row to the place of another (EDT-105). The list may be narrowed,
 * so the move is made inside the full order: the dragged table takes the place
 * of the one it was dropped on.
 */
export function planReorderTables(
    design: Design,
    activeId: string,
    overId: string
): Command | undefined {
    const ids = reorderedIds(design.entities.order, activeId, overId);
    return ids ? { type: 'entity.reorder', ids } : undefined;
}
