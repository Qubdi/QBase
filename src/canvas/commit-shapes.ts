import { apply } from '@/core/commands/apply';
import type { Command } from '@/core/commands/command';
import { planMembership, planMoveRegion } from '@/core/commands/plan-visual';
import type { Design } from '@/core/model/design';
import type { Entity } from '@/core/model/entity';
import { boxAt } from '@/core/model/memo';
import type { Size } from '@/core/model/region-membership';
import { clampWidth } from './geometry';
import type { LiveShapes } from './flow-model';

/**
 * Turns what a drag or resize left behind into the one command that is sent on
 * release (EDT-034, EDT-224): moves, new widths and boxes, then the region
 * membership that follows from the new geometry (EDT-036, EDT-203).
 * Returns undefined when nothing really changed.
 */
export function commitShapes(
    design: Design,
    live: LiveShapes,
    measure?: (entity: Entity) => Size
): Command | undefined {
    const commands: Command[] = [];
    const entityMoves: { id: string; x: number; y: number }[] = [];

    for (const [id, at] of Object.entries(live.positions)) {
        const entity = design.entities.byId[id];
        const region = design.regions.byId[id];
        const memo = design.memos.byId[id];
        if (entity) {
            if (entity.x !== at.x || entity.y !== at.y)
                entityMoves.push({ id, x: at.x, y: at.y });
        } else if (region) {
            // a region and its members move together; a resize that also
            // shifts the corner is handled below as a box change
            const resized = live.sizes[id];
            if (resized) continue;
            const step = planMoveRegion(design, id, at.x, at.y);
            if (step && (region.box.x !== at.x || region.box.y !== at.y))
                commands.push(step);
        } else if (memo && !live.sizes[id]) {
            // a note keeps its distance from what it belongs to, wherever that ends up
            const box = boxAt(design, memo, at, live.positions);
            if (memo.box.x !== box.x || memo.box.y !== box.y)
                commands.push({
                    type: 'item.update',
                    collection: 'memos',
                    id,
                    patch: { box },
                });
        }
    }
    if (entityMoves.length > 0)
        commands.push({ type: 'entity.move', moves: entityMoves });

    for (const [id, size] of Object.entries(live.sizes)) {
        const entity = design.entities.byId[id];
        const region = design.regions.byId[id];
        const memo = design.memos.byId[id];
        const at = live.positions[id];
        if (entity) {
            const width = clampWidth(size.width);
            if (width !== (entity.width ?? 224))
                commands.push({
                    type: 'entity.update',
                    id,
                    patch: { width },
                });
            if (at && (at.x !== entity.x || at.y !== entity.y))
                commands.push({
                    type: 'entity.move',
                    moves: [{ id, x: at.x, y: at.y }],
                });
        } else if (region || memo) {
            const box = (region ?? memo)!.box;
            const moved =
                memo && at ? boxAt(design, memo, at, live.positions) : box;
            const next = {
                x: region ? (at?.x ?? box.x) : moved.x,
                y: region ? (at?.y ?? box.y) : moved.y,
                width: size.width,
                height: size.height ?? box.height,
            };
            if (JSON.stringify(next) !== JSON.stringify(box))
                commands.push({
                    type: 'item.update',
                    collection: region ? 'regions' : 'memos',
                    id,
                    patch: { box: next },
                });
        }
    }
    if (commands.length === 0) return undefined;

    const moved = apply(design, { type: 'group', commands }, { now: 0 });
    const follow = moved.ok ? planMembership(moved.design, measure) : undefined;
    return {
        type: 'group',
        label: 'move',
        commands: follow ? [...commands, follow] : commands,
    };
}
