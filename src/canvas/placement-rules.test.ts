import { describe, expect, it } from 'vitest';
import type { Box } from '@/core/model/region';
import { findFreeShift } from './placement';

const rect = (x: number, y: number, width = 100, height = 100): Box => ({
    x,
    y,
    width,
    height,
});

const apart = (a: Box, b: Box) =>
    a.x + a.width <= b.x ||
    a.x >= b.x + b.width ||
    a.y + a.height <= b.y ||
    a.y >= b.y + b.height;

const shifted = (r: Box, s: { dx: number; dy: number }) =>
    rect(r.x + s.dx, r.y + s.dy, r.width, r.height);

describe('findFreeShift', () => {
    it('does not move tables that overlap nothing', () => {
        expect(findFreeShift([rect(0, 0)], [rect(300, 0)])).toEqual({
            dx: 0,
            dy: 0,
        });
    });

    it('does not count tables that only touch as overlapping', () => {
        expect(findFreeShift([rect(0, 0)], [rect(100, 0)], 0)).toEqual({
            dx: 0,
            dy: 0,
        });
    });

    it('moves a dropped table just clear of the one it landed on', () => {
        expect(findFreeShift([rect(60, 0)], [rect(0, 0)], 20)).toEqual({
            dx: 60,
            dy: 0,
        });
    });

    it('goes around tables that block the nearest sides', () => {
        const others = [rect(0, 0), rect(120, 0)];
        const moved = shifted(
            rect(50, 0),
            findFreeShift([rect(50, 0)], others, 20)
        );
        expect(others.every((o) => apart(moved, o))).toBe(true);
    });

    it('moves a dragged group together and clear of the others', () => {
        const group = [rect(50, 0), rect(250, 0)];
        const others = [rect(0, 0)];
        const shift = findFreeShift(group, others, 20);
        expect(
            group.every((g) => others.every((o) => apart(shifted(g, shift), o)))
        ).toBe(true);
    });
});
