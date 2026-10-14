import { describe, expect, it } from 'vitest';
import { estimateBox, findFreeSpot, type Box } from '../placement';

const box = (x: number, y: number, width = 224, height = 112): Box => ({
    x,
    y,
    width,
    height,
});
const apart = (a: Box, b: Box) =>
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y;

describe('estimateBox', () => {
    it('uses the table width and grows with fields, capped at ten rows', () => {
        expect(estimateBox({ x: 1, y: 2, width: 300, fields: [1, 2] })).toEqual(
            { x: 1, y: 2, width: 300, height: 48 + 64 }
        );
        expect(estimateBox({ x: 0, y: 0, fields: [] }).width).toBe(224);
        expect(
            estimateBox({ x: 0, y: 0, fields: new Array(40).fill(0) }).height
        ).toBe(48 + 320);
    });
});

describe('findFreeSpot', () => {
    const size = { width: 224, height: 112 };

    it('starts at the origin on an empty canvas', () => {
        expect(findFreeSpot(size, [], [])).toEqual({ x: 0, y: 0 });
    });

    it('goes right of everything when it has no relatives', () => {
        const occupied = [box(0, 0), box(500, 100)];
        const spot = findFreeSpot(size, [], occupied);
        expect(spot.x).toBeGreaterThanOrEqual(724);
        expect(occupied.every((o) => apart({ ...spot, ...size }, o))).toBe(
            true
        );
    });

    it('stacks unrelated tables instead of overlapping when the right edge is busy', () => {
        const occupied = [box(0, 0), box(300, 0)];
        const first = findFreeSpot(size, [], occupied);
        const second = findFreeSpot(
            size,
            [],
            [...occupied, { ...first, ...size }]
        );
        expect(apart({ ...first, ...size }, { ...second, ...size })).toBe(true);
    });

    it('puts a table next to its relative, to the right first', () => {
        const anchor = box(100, 100);
        const spot = findFreeSpot(size, [anchor], [anchor]);
        expect(spot.x).toBeGreaterThan(anchor.x + anchor.width);
        expect(spot.y).toBe(anchor.y);
    });

    it('is not fooled by a size that carries its own coordinates', () => {
        const anchor = box(100, 100);
        const spot = findFreeSpot(
            { ...size, x: 100, y: 100 } as typeof size,
            [anchor],
            [anchor]
        );
        expect(apart({ ...spot, ...size }, anchor)).toBe(true);
    });

    it('moves to the next free side when the right is taken', () => {
        const anchor = box(100, 100);
        const right = box(384, 100);
        const spot = findFreeSpot(size, [anchor], [anchor, right]);
        const placed = { ...spot, ...size };
        expect(apart(placed, anchor)).toBe(true);
        expect(apart(placed, right)).toBe(true);
    });

    it('never overlaps anything, however crowded', () => {
        const anchor = box(0, 0);
        const crowd: Box[] = [anchor];
        for (let i = 0; i < 6; i++) {
            const spot = findFreeSpot(size, [anchor], crowd);
            const placed = { ...spot, ...size };
            expect(crowd.every((o) => apart(placed, o))).toBe(true);
            crowd.push(placed);
        }
    });

    it('tries the nearest relative first', () => {
        const near = box(0, 0);
        const far = box(5000, 5000);
        const spot = findFreeSpot(size, [near, far], [near, far]);
        expect(spot.x).toBeLessThan(1000);
    });
});
