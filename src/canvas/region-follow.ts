import type { Design } from '@/core/model/design';
import { entityList } from '@/core/model/lookup';
import type { Id } from '@/core/model/id';
import type { LiveShapes } from './flow-model';

type Positions = LiveShapes['positions'];

/**
 * While an area is dragged, the tables inside it travel with it (EDT-037) so
 * the picture matches what the drop will do. Returns the live positions with
 * every member moved by the same step as the area; a member that is moving by
 * itself in the same batch (it is selected too) keeps its own position.
 */
export function withMembersFollowing(
    design: Design,
    regionId: Id,
    before: Positions,
    after: Positions,
    movedByThemselves: ReadonlySet<Id>
): Positions {
    const region = design.regions.byId[regionId];
    const to = after[regionId];
    if (!region || !to) return after;
    const from = before[regionId] ?? { x: region.box.x, y: region.box.y };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 0 && dy === 0) return after;
    let next = after;
    for (const entity of entityList(design)) {
        if (entity.regionId !== regionId || movedByThemselves.has(entity.id))
            continue;
        const at = next[entity.id] ??
            before[entity.id] ?? { x: entity.x, y: entity.y };
        next = { ...next, [entity.id]: { x: at.x + dx, y: at.y + dy } };
    }
    return next;
}
