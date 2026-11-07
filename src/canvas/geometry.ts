import { TABLE_WIDTH } from '@/core/model/entity';
import type { Entity } from '@/core/model/entity';
import type { Id } from '@/core/model/id';
import { estimatedSize } from '@/core/model/region-membership';
import type { Size } from '@/core/model/region-membership';
import type { Box } from '@/core/model/region';

export const GRID = 20;
export const MIN_REGION_HEIGHT = 100;
export const FIT_PADDING = 0.1;
export const FIT_MAX_ZOOM = 0.8;

export function snapTo(value: number, grid = GRID): number {
    return Math.round(value / grid) * grid;
}

/** The size an entity is drawn at: measured if known, else a guess from its rows. */
export function sizeFor(
    entity: Entity,
    measured: Readonly<Record<Id, Size>>
): Size {
    const known = measured[entity.id];
    const guess = estimatedSize(entity);
    return known
        ? { width: entity.width ?? guess.width, height: known.height }
        : guess;
}

export function boxOf(entity: Entity, size: Size): Box {
    return { x: entity.x, y: entity.y, ...size };
}

export function intersects(a: Box, b: Box): boolean {
    return (
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height
    );
}

/** True when `inner` lies wholly within `outer` (used by the rubber band). */
export function contains(outer: Box, inner: Box): boolean {
    return (
        inner.x >= outer.x &&
        inner.y >= outer.y &&
        inner.x + inner.width <= outer.x + outer.width &&
        inner.y + inner.height <= outer.y + outer.height
    );
}

/** Ids of the boxes that touch at least one other box. */
export function overlappingIds(
    boxes: ReadonlyArray<{ id: Id; box: Box }>
): Set<Id> {
    const hit = new Set<Id>();
    for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
            if (intersects(boxes[i].box, boxes[j].box)) {
                hit.add(boxes[i].id);
                hit.add(boxes[j].id);
            }
        }
    }
    return hit;
}

export function clampWidth(width: number): number {
    return Math.min(TABLE_WIDTH.max, Math.max(TABLE_WIDTH.min, width));
}

/**
 * The header button toggles between the narrowest and the widest width
 * (EDT-082 change: two states, no middle step).
 */
export function toggledWidth(current: number | undefined): number {
    const now = current ?? TABLE_WIDTH.default;
    return now >= TABLE_WIDTH.max ? TABLE_WIDTH.min : TABLE_WIDTH.max;
}

/** The smallest box around all the given boxes, or undefined for none. */
export function enclosing(boxes: readonly Box[]): Box | undefined {
    if (boxes.length === 0) return undefined;
    const left = Math.min(...boxes.map((b) => b.x));
    const top = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + b.width));
    const bottom = Math.max(...boxes.map((b) => b.y + b.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
}

export interface View {
    x: number;
    y: number;
    zoom: number;
}

/**
 * True when at least one box shows inside a view of the given size (EDT-023).
 * `view` is the pan and zoom of the canvas: a point of the diagram appears at
 * `point * zoom + offset` on the screen.
 */
export function anyOnScreen(
    boxes: readonly Box[],
    view: View,
    size: Size
): boolean {
    const screen: Box = { x: 0, y: 0, ...size };
    return boxes.some((b) =>
        intersects(
            {
                x: b.x * view.zoom + view.x,
                y: b.y * view.zoom + view.y,
                width: b.width * view.zoom,
                height: b.height * view.zoom,
            },
            screen
        )
    );
}

/** A container size counts as changed once either side moves by 15% or more. */
export function resizedEnough(
    before: { w: number; h: number },
    now: { w: number; h: number },
    ratio = 0.15
): boolean {
    const far = (a: number, b: number) =>
        Math.abs(a - b) >= Math.max(1, a) * ratio;
    return far(before.w, now.w) || far(before.h, now.h);
}
