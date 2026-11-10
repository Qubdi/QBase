import { traitsOf } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import type { Entity } from '@/core/model/entity';
import type { Id } from '@/core/model/id';
import { entityList } from '@/core/model/lookup';
import {
    isVisible,
    schemaIdOf,
    tidyFilter,
} from '@/core/model/visibility-filter';
import type { VisibilityFilter } from '@/core/model/visibility-filter';

export type GroupBy = 'schema' | 'area';

export type Shown = 'all' | 'some' | 'none';

export interface TreeTable {
    entity: Entity;
    shown: boolean;
}

export interface TreeGroup {
    /** a schema id, a region id, or '' for the group without either */
    key: string;
    label: string;
    /** false for the group of tables that have no schema or no area */
    named: boolean;
    tables: TreeTable[];
    shown: Shown;
}

function defaultSchemaOf(design: Design): string | undefined {
    return traitsOf(design.databaseType).defaultSchema;
}

/** Ids of the tables the filter lets through (views included, whatever their switch says). */
export function visibleIds(design: Design, filter: VisibilityFilter): Set<Id> {
    const defaultSchema = defaultSchemaOf(design);
    return new Set(
        entityList(design)
            .filter((e) => isVisible(filter, e, defaultSchema))
            .map((e) => e.id)
    );
}

/** True when the diagram has tables and the filter hides every one (EDT-069). */
export function hidesEverything(design: Design, filter: VisibilityFilter) {
    return (
        design.entities.order.length > 0 &&
        visibleIds(design, filter).size === 0
    );
}

/**
 * The filter that shows exactly these tables (EDT-072): a schema whose tables
 * are all shown counts as shown itself, and showing everything switches the
 * filter off.
 */
export function filterShowing(design: Design, ids: ReadonlySet<Id>) {
    return tidyFilter(
        { tableIds: [...ids] },
        entityList(design),
        defaultSchemaOf(design)
    );
}

/** Shows or hides one table; the other choices stay as they are. */
export function setTableShown(
    design: Design,
    filter: VisibilityFilter,
    id: Id,
    shown: boolean
): VisibilityFilter {
    const ids = visibleIds(design, filter);
    if (shown) ids.add(id);
    else ids.delete(id);
    return filterShowing(design, ids);
}

/** Shows or hides all the given tables at once (a group's eye, EDT-064). */
export function setTablesShown(
    design: Design,
    filter: VisibilityFilter,
    tableIds: readonly Id[],
    shown: boolean
): VisibilityFilter {
    const ids = visibleIds(design, filter);
    for (const id of tableIds) {
        if (shown) ids.add(id);
        else ids.delete(id);
    }
    return filterShowing(design, ids);
}

function groupShown(tables: TreeTable[]): Shown {
    const on = tables.filter((t) => t.shown).length;
    if (on === 0) return 'none';
    return on === tables.length ? 'all' : 'some';
}

export interface TreeInput {
    design: Design;
    filter: VisibilityFilter;
    groupBy: GroupBy;
    /** narrows the rows by table name; it never changes what is hidden (EDT-066) */
    text?: string;
    showViews: boolean;
}

/**
 * The tree of the Filter Tables panel (EDT-062 to EDT-068): groups by schema
 * or by area, each with its tables. Groups left empty by the search are
 * dropped. A database without schemas has a single flat group.
 */
export function buildTree({
    design,
    filter,
    groupBy,
    text = '',
    showViews,
}: TreeInput): TreeGroup[] {
    const needle = text.trim().toLowerCase();
    const defaultSchema = defaultSchemaOf(design);
    const groups = new Map<string, TreeGroup>();

    const groupFor = (entity: Entity): { key: string; label: string } => {
        if (groupBy === 'area') {
            const region = entity.regionId
                ? design.regions.byId[entity.regionId]
                : undefined;
            return region
                ? { key: region.id, label: region.label }
                : { key: '', label: '' };
        }
        const name = entity.schema?.trim() ? entity.schema : defaultSchema;
        return name && traitsOf(design.databaseType).hasSchemas
            ? { key: schemaIdOf(name), label: name }
            : { key: '', label: '' };
    };

    for (const entity of entityList(design)) {
        if (!showViews && entity.kind === 'view') continue;
        if (needle && !entity.name.toLowerCase().includes(needle)) continue;
        const { key, label } = groupFor(entity);
        let group = groups.get(key);
        if (!group) {
            group = { key, label, named: key !== '', tables: [], shown: 'all' };
            groups.set(key, group);
        }
        group.tables.push({
            entity,
            shown: isVisible(filter, entity, defaultSchema),
        });
    }
    const list = [...groups.values()];
    for (const group of list) group.shown = groupShown(group.tables);
    // named groups first, in order of first use; the group with neither last
    return [...list.filter((g) => g.named), ...list.filter((g) => !g.named)];
}
