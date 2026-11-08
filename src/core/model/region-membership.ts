import { entityList } from './lookup';
import type { Design } from './design';
import type { Entity } from './entity';
import { TABLE_WIDTH } from './entity';
import { COLUMN_ROW_HEIGHT, TABLE_HEADER_HEIGHT } from './memo';
import type { Id } from './id';
import type { Region } from './region';

export interface Size {
    width: number;
    height: number;
}

/**
 * A rough height used when the real, measured one is not known: header plus
 * 32 px per column row. The canvas passes measured sizes instead.
 */
export function estimatedSize(entity: Entity): Size {
    return {
        width: entity.width ?? TABLE_WIDTH.default,
        height:
            TABLE_HEADER_HEIGHT + COLUMN_ROW_HEIGHT * entity.columnIds.length,
    };
}

function inside(entity: Entity, size: Size, region: Region): boolean {
    return (
        entity.x >= region.box.x &&
        entity.y >= region.box.y &&
        entity.x + size.width <= region.box.x + region.box.width &&
        entity.y + size.height <= region.box.y + region.box.height
    );
}

/**
 * The region each entity belongs to (editor 10.3): the entity box must lie
 * completely inside the region rectangle; if several regions qualify, the
 * top-most one (latest in the order) wins. Entities in no region map to
 * `undefined`.
 */
export function regionMembership(
    design: Design,
    measure: (entity: Entity) => Size = estimatedSize
): Map<Id, Id | undefined> {
    const regions = design.regions.order.map((id) => design.regions.byId[id]);
    const result = new Map<Id, Id | undefined>();
    for (const entity of entityList(design)) {
        const size = measure(entity);
        let owner: Id | undefined;
        for (const region of regions) {
            if (inside(entity, size, region)) owner = region.id;
        }
        result.set(entity.id, owner);
    }
    return result;
}
