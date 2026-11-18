import type { Design } from '@/core/model/design';
import type { Entity } from '@/core/model/entity';
import type { Id } from '@/core/model/id';
import type { Memo } from '@/core/model/memo';
import type { Region } from '@/core/model/region';
import { listOf } from '@/core/model/collection';
import { entityList } from '@/core/model/lookup';
import { nameMatches } from '@/features/tables/table-list';

/** Areas narrowed by the text in the filter box (EDT-208). */
export function listRegions(design: Design, text: string): Region[] {
    return listOf(design.regions).filter((r) => nameMatches(r.label, text));
}

/** The first line of a note's text: what its list row shows (EDT-214). */
export function firstLine(body: string): string {
    return body.split(/\r?\n/, 1)[0].trim();
}

/** Notes narrowed by the text in the filter box. */
export function listMemos(design: Design, text: string): Memo[] {
    return listOf(design.memos).filter((m) => nameMatches(m.body, text));
}

export interface AreaTables {
    /** the tables of each area that has any, in the design's order */
    inside: Map<Id, Entity[]>;
    /** the tables that are in no area */
    outside: Entity[];
}

/**
 * Which tables are in which area. Each table records its area (`regionId`,
 * kept in line with the geometry after every move, editor 10.3), so nothing is
 * measured here and the list agrees with the canvas and the Group by Area
 * filter. A table whose area is gone counts as outside. Views are left out
 * while Database Views is off, as they are in the Tables list.
 */
export function areaTables(design: Design, showViews: boolean): AreaTables {
    const inside = new Map<Id, Entity[]>();
    const outside: Entity[] = [];
    for (const entity of entityList(design)) {
        if (!showViews && entity.kind === 'view') continue;
        const id = entity.regionId;
        if (id !== undefined && design.regions.byId[id] !== undefined) {
            const list = inside.get(id);
            if (list) list.push(entity);
            else inside.set(id, [entity]);
        } else outside.push(entity);
    }
    return { inside, outside };
}
