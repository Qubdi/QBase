import type { Command, Move } from '@/core/commands/command';
import { planMembership } from '@/core/commands/plan-visual';
import { apply } from '@/core/commands/apply';
import type { Design } from '@/core/model/design';
import type { Entity } from '@/core/model/entity';
import type { Id } from '@/core/model/id';
import { entityList } from '@/core/model/lookup';
import type { Size } from '@/core/model/region-membership';
import type { Point } from './flow-model';

export interface Tile {
    id: Id;
    width: number;
    height: number;
}

export interface Layout {
    positions: Map<Id, Point>;
    width: number;
    height: number;
}

const GAP_X = 80;
const GAP_Y = 40;
const BLOCK_GAP = 100;
/** room inside a region for its name strip, and a margin on the other sides */
export const REGION_TOP = 44;
export const REGION_MARGIN = 24;

/**
 * Lays tiles out with related ones close together (EDT-051). Tiles that share
 * links form a group; inside a group tiles sit in columns by their distance
 * from the best-connected tile, so a link usually runs between neighbouring
 * columns. Groups stack downwards; tiles with no links go in a grid to the
 * right of them.
 */
export function layoutTiles(
    tiles: readonly Tile[],
    pairs: ReadonlyArray<readonly [Id, Id]>
): Layout {
    const byId = new Map(tiles.map((t) => [t.id, t]));
    const near = new Map<Id, Id[]>(tiles.map((t) => [t.id, []]));
    for (const [a, b] of pairs) {
        if (a === b || !byId.has(a) || !byId.has(b)) continue;
        if (!near.get(a)!.includes(b)) near.get(a)!.push(b);
        if (!near.get(b)!.includes(a)) near.get(b)!.push(a);
    }

    const placed = new Set<Id>();
    const groups: Tile[][][] = [];
    const lonely: Tile[] = [];
    const order = [...tiles].sort(
        (p, q) => near.get(q.id)!.length - near.get(p.id)!.length
    );
    for (const start of order) {
        if (placed.has(start.id)) continue;
        if (near.get(start.id)!.length === 0) {
            placed.add(start.id);
            lonely.push(start);
            continue;
        }
        const columns: Tile[][] = [];
        let frontier = [start.id];
        placed.add(start.id);
        while (frontier.length > 0) {
            columns.push(frontier.map((id) => byId.get(id)!));
            const next: Id[] = [];
            for (const id of frontier)
                for (const other of near.get(id)!)
                    if (!placed.has(other)) {
                        placed.add(other);
                        next.push(other);
                    }
            frontier = next;
        }
        groups.push(columns);
    }

    const positions = new Map<Id, Point>();
    let top = 0;
    let usedWidth = 0;
    for (const columns of groups) {
        let left = 0;
        let tallest = 0;
        for (const column of columns) {
            let y = top;
            for (const tile of column) {
                positions.set(tile.id, { x: left, y });
                y += tile.height + GAP_Y;
            }
            tallest = Math.max(tallest, y - top - GAP_Y);
            left += Math.max(...column.map((t) => t.width)) + GAP_X;
        }
        usedWidth = Math.max(usedWidth, left - GAP_X);
        top += tallest + BLOCK_GAP;
    }
    let height = groups.length > 0 ? top - BLOCK_GAP : 0;

    let width = usedWidth;
    if (lonely.length > 0) {
        const across = Math.ceil(Math.sqrt(lonely.length));
        const x0 = groups.length > 0 ? usedWidth + BLOCK_GAP : 0;
        const cell = Math.max(...lonely.map((t) => t.width)) + GAP_X;
        let y = 0;
        let right = x0;
        for (let i = 0; i < lonely.length; i += across) {
            const row = lonely.slice(i, i + across);
            row.forEach((tile, k) => {
                positions.set(tile.id, { x: x0 + k * cell, y });
                right = Math.max(right, x0 + k * cell + tile.width);
            });
            y += Math.max(...row.map((t) => t.height)) + GAP_Y;
        }
        width = right;
        height = Math.max(height, y - GAP_Y);
    }
    return { positions, width, height };
}

export interface ArrangeScope {
    /** only these entities are arranged (the visible ones) */
    ids: ReadonlySet<Id>;
    /** arrange only the tables of this region, inside it */
    regionId?: Id;
}

type Measure = (entity: Entity) => Size;

function tileOf(entity: Entity, measure: Measure): Tile {
    return { id: entity.id, ...measure(entity) };
}

function linkPairs(design: Design, within: ReadonlySet<Id>) {
    return design.links.order
        .map((id) => design.links.byId[id])
        .filter(
            (l) => within.has(l.sourceEntityId) && within.has(l.targetEntityId)
        )
        .map((l) => [l.sourceEntityId, l.targetEntityId] as const);
}

/**
 * The one command that arranges the diagram (EDT-050 to EDT-053): visible
 * tables outside regions first, then each region with its own tables inside
 * it, the region growing to hold them. With `regionId` only that region is
 * laid out and stays where it is.
 */
export function planArrange(
    design: Design,
    scope: ArrangeScope,
    measure: Measure
): Command | undefined {
    const entities = entityList(design).filter((e) => scope.ids.has(e.id));
    const moves: Move[] = [];
    const regionCommands: Command[] = [];

    const arrangeRegion = (regionId: Id, origin: Point | undefined) => {
        const region = design.regions.byId[regionId];
        if (!region) return { width: 0, height: 0 };
        const members = entities.filter((e) => e.regionId === regionId);
        const ids = new Set(members.map((e) => e.id));
        const layout = layoutTiles(
            members.map((e) => tileOf(e, measure)),
            linkPairs(design, ids)
        );
        const x = origin?.x ?? region.box.x;
        const y = origin?.y ?? region.box.y;
        for (const [id, at] of layout.positions)
            moves.push({
                id,
                x: x + REGION_MARGIN + at.x,
                y: y + REGION_TOP + at.y,
            });
        const box = {
            x,
            y,
            width: Math.max(region.box.width, layout.width + 2 * REGION_MARGIN),
            height: Math.max(
                region.box.height,
                layout.height + REGION_TOP + REGION_MARGIN
            ),
        };
        regionCommands.push({
            type: 'item.update',
            collection: 'regions',
            id: regionId,
            patch: { box },
        });
        return box;
    };

    if (scope.regionId) {
        arrangeRegion(scope.regionId, undefined);
    } else {
        const loose = entities.filter(
            (e) => !e.regionId || !design.regions.byId[e.regionId]
        );
        const looseIds = new Set(loose.map((e) => e.id));
        const layout = layoutTiles(
            loose.map((e) => tileOf(e, measure)),
            linkPairs(design, looseIds)
        );
        for (const [id, at] of layout.positions)
            moves.push({ id, x: at.x, y: at.y });
        let x = 0;
        const y = loose.length > 0 ? layout.height + BLOCK_GAP : 0;
        for (const regionId of design.regions.order) {
            if (!entities.some((e) => e.regionId === regionId)) continue;
            const box = arrangeRegion(regionId, { x, y });
            x += box.width + BLOCK_GAP;
        }
    }
    if (moves.length === 0) return undefined;

    const commands: Command[] = [
        { type: 'entity.move', moves },
        ...regionCommands,
    ];
    const next = apply(design, { type: 'group', commands }, { now: 0 });
    const follow = next.ok ? planMembership(next.design, measure) : undefined;
    return {
        type: 'group',
        label: 'arrange',
        commands: follow ? [...commands, follow] : commands,
    };
}

/**
 * Move to Area (EDT-204, EDT-205). Tables join the region in tidy rows below
 * the tables already there, wrapping at the region's width; the region grows
 * to fit. With no region the tables step out to its right.
 */
export function planMoveToArea(
    design: Design,
    ids: readonly Id[],
    regionId: Id | undefined,
    measure: Measure
): Command | undefined {
    const moving = entityList(design).filter((e) => ids.includes(e.id));
    if (moving.length === 0) return undefined;
    const moves: Move[] = [];
    const commands: Command[] = [];

    if (regionId === undefined) {
        // each table leaves the region it is in, to the right of it
        const spill = new Map<Id, number>();
        for (const entity of moving) {
            const home =
                entity.regionId && design.regions.byId[entity.regionId];
            if (!home) continue;
            const used = spill.get(home.id) ?? 0;
            const height = measure(entity).height;
            moves.push({
                id: entity.id,
                x: home.box.x + home.box.width + REGION_MARGIN,
                y: home.box.y + used,
            });
            spill.set(home.id, used + height + GAP_Y);
        }
    } else {
        const region = design.regions.byId[regionId];
        if (!region) return undefined;
        const staying = entityList(design).filter(
            (e) => e.regionId === regionId && !ids.includes(e.id)
        );
        let cursorY = Math.max(
            region.box.y + REGION_TOP,
            ...staying.map((e) => e.y + measure(e).height + GAP_Y)
        );
        let cursorX = region.box.x + REGION_MARGIN;
        let rowHeight = 0;
        let right = region.box.x + region.box.width;
        for (const entity of moving) {
            const size = measure(entity);
            const roomEnd = region.box.x + region.box.width - REGION_MARGIN;
            if (
                cursorX > region.box.x + REGION_MARGIN &&
                cursorX + size.width > roomEnd
            ) {
                cursorX = region.box.x + REGION_MARGIN;
                cursorY += rowHeight + GAP_Y;
                rowHeight = 0;
            }
            moves.push({ id: entity.id, x: cursorX, y: cursorY });
            right = Math.max(right, cursorX + size.width + REGION_MARGIN);
            cursorX += size.width + GAP_Y;
            rowHeight = Math.max(rowHeight, size.height);
        }
        const bottom = cursorY + rowHeight + REGION_MARGIN;
        const box = {
            ...region.box,
            width: Math.max(region.box.width, right - region.box.x),
            height: Math.max(region.box.height, bottom - region.box.y),
        };
        if (box.width !== region.box.width || box.height !== region.box.height)
            commands.push({
                type: 'item.update',
                collection: 'regions',
                id: regionId,
                patch: { box },
            });
    }
    if (moves.length === 0) return undefined;
    const all: Command[] = [{ type: 'entity.move', moves }, ...commands];
    const next = apply(design, { type: 'group', commands: all }, { now: 0 });
    const follow = next.ok ? planMembership(next.design, measure) : undefined;
    return {
        type: 'group',
        label: 'move to area',
        commands: follow ? [...all, follow] : all,
    };
}
