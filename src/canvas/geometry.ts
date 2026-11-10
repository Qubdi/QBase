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

/** How many other boxes each overlapping box touches (boxes touching nothing are left out). */
export function overlapCounts(
    boxes: ReadonlyArray<{ id: Id; box: Box }>
): Map<Id, number> {
    const counts = new Map<Id, number>();
    for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
            if (intersects(boxes[i].box, boxes[j].box)) {
                counts.set(boxes[i].id, (counts.get(boxes[i].id) ?? 0) + 1);
                counts.set(boxes[j].id, (counts.get(boxes[j].id) ?? 0) + 1);
            }
        }
    }
    return counts;
}

export function clampWidth(width: number): number {
    return Math.min(TABLE_WIDTH.max, Math.max(TABLE_WIDTH.min, width));
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

/** A rectangle in page pixels. */
export interface PageRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/**
 * How far to move the picture (in page pixels, positive is right and down) so
 * that `card` lies inside `safe`. A card taller or wider than the safe area is
 * lined up with its top or left edge.
 */
export function revealShift(
    card: PageRect,
    safe: PageRect
): { dx: number; dy: number } {
    const along = (
        start: number,
        end: number,
        low: number,
        high: number
    ): number => {
        if (end - start >= high - low || start < low) return low - start;
        if (end > high) return high - end;
        return 0;
    };
    return {
        dx: along(card.left, card.right, safe.left, safe.right),
        dy: along(card.top, card.bottom, safe.top, safe.bottom),
    };
}
