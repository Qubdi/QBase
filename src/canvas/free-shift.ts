import type { Box } from '@/core/model/region';
import { intersects } from './geometry';

export interface Shift {
    dx: number;
    dy: number;
}

const NONE: Shift = { dx: 0, dy: 0 };

const moved = (box: Box, shift: Shift): Box => ({
    ...box,
    x: box.x + shift.dx,
    y: box.y + shift.dy,
});

/**
 * How far to slide a group of boxes (one dropped table, or several pasted or
 * dragged together) so that none of them lies on any of `others`. Boxes that
 * only touch do not count as overlapping. Returns no shift when nothing
 * overlaps; otherwise the shortest straight slide that leaves `gap` pixels
 * clear of every other box, or failing that a slide past the right-most one.
 */
export function findFreeShift(
    group: readonly Box[],
    others: readonly Box[],
    gap = 0
): Shift {
    const hit = group.some((g) => others.some((o) => intersects(g, o)));
    if (!hit) return NONE;

    const padded = others.map((o) => ({
        x: o.x - gap,
        y: o.y - gap,
        width: o.width + 2 * gap,
        height: o.height + 2 * gap,
    }));
    const clear = (shift: Shift) =>
        group.every((g) =>
            padded.every((o) => !intersects(moved(g, shift), o))
        );

    const candidates: Shift[] = [];
    for (const g of group) {
        for (const o of padded) {
            candidates.push(
                { dx: o.x + o.width - g.x, dy: 0 },
                { dx: o.x - g.width - g.x, dy: 0 },
                { dx: 0, dy: o.y + o.height - g.y },
                { dx: 0, dy: o.y - g.height - g.y }
            );
        }
    }
    const best = candidates
        .filter(clear)
        .sort((a, b) => Math.abs(a.dx + a.dy) - Math.abs(b.dx + b.dy))[0];
    if (best) return best;

    const left = Math.min(...group.map((g) => g.x));
    const right = Math.max(...padded.map((o) => o.x + o.width));
    return { dx: right - left, dy: 0 };
}
