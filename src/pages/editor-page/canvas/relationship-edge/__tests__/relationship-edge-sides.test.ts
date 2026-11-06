import { describe, expect, it } from 'vitest';
import {
    chooseSides,
    closestSides,
    SIDE_SWITCH_MARGIN,
    type Anchors,
    type Sides,
} from '../relationship-edge-sides';

// a source table 200 wide at x=0 and a target table 200 wide at x=tx
const anchors = (tx: number): Anchors => ({
    sourceLeftX: 0,
    sourceRightX: 200,
    targetLeftX: tx,
    targetRightX: tx + 200,
});

const same = (a: Sides, b: Sides) =>
    a.sourceSide === b.sourceSide && a.targetSide === b.targetSide;

describe('closestSides', () => {
    it('joins the facing sides when the target is far to the right', () => {
        expect(closestSides(anchors(600))).toEqual({
            sourceSide: 'right',
            targetSide: 'left',
        });
    });

    it('joins the facing sides when the target is far to the left', () => {
        expect(closestSides(anchors(-600))).toEqual({
            sourceSide: 'left',
            targetSide: 'right',
        });
    });

    it('uses the same side of both tables when they are stacked', () => {
        expect(closestSides(anchors(0))).toEqual({
            sourceSide: 'left',
            targetSide: 'left',
        });
    });

    it('prefers the first pair on an exact tie, as it always did', () => {
        // left-left and right-right are both 0 apart when the tables line up
        const tie: Anchors = {
            sourceLeftX: 0,
            sourceRightX: 100,
            targetLeftX: 0,
            targetRightX: 100,
        };
        expect(closestSides(tie)).toEqual({
            sourceSide: 'left',
            targetSide: 'left',
        });
    });
});

describe('chooseSides', () => {
    it('is just the closest pair when there is no earlier choice', () => {
        for (const tx of [-600, -150, 0, 150, 600]) {
            expect(chooseSides(anchors(tx), null)).toEqual(
                closestSides(anchors(tx))
            );
        }
    });

    it('keeps the earlier pair when the best one is only slightly better', () => {
        const prev: Sides = { sourceSide: 'right', targetSide: 'left' };
        // find a spot where another pair is better, but by less than the margin
        let tx = 600;
        while (closestSides(anchors(tx)).sourceSide === 'right') tx -= 1;
        const best = closestSides(anchors(tx));
        expect(same(best, prev)).toBe(false);
        expect(chooseSides(anchors(tx), prev)).toEqual(prev);
    });

    it('moves to the best pair once it is clearly better', () => {
        const prev: Sides = { sourceSide: 'right', targetSide: 'left' };
        // the target is now far to the left of the source
        expect(chooseSides(anchors(-600), prev)).toEqual({
            sourceSide: 'left',
            targetSide: 'right',
        });
    });

    it('moves exactly when the gain passes the margin', () => {
        const prev: Sides = { sourceSide: 'right', targetSide: 'left' };
        let gains = 0;
        for (let tx = 600; tx >= -600; tx--) {
            const a = anchors(tx);
            const best = closestSides(a);
            if (same(best, prev)) continue;
            const keep = Math.abs(a.sourceRightX - a.targetLeftX);
            const move = Math.abs(
                (best.sourceSide === 'left' ? a.sourceLeftX : a.sourceRightX) -
                    (best.targetSide === 'left'
                        ? a.targetLeftX
                        : a.targetRightX)
            );
            const moved = !same(chooseSides(a, prev), prev);
            expect(moved).toBe(keep - move > SIDE_SWITCH_MARGIN);
            gains++;
        }
        expect(gains).toBeGreaterThan(0);
    });

    it('does not flip back and forth while a table wobbles around the crossover', () => {
        // drag the target to the left across the source, wobbling by a few pixels
        const flips = (choose: (a: Anchors, prev: Sides | null) => Sides) => {
            let prev: Sides | null = null;
            let count = 0;
            const path: number[] = [];
            for (let tx = 500; tx >= -500; tx -= 6) {
                path.push(tx, tx + 5, tx - 4, tx + 3); // mouse jitter
            }
            for (const tx of path) {
                const next = choose(anchors(tx), prev);
                if (prev && !same(prev, next)) count++;
                prev = next;
            }
            return count;
        };
        const old = flips((a) => closestSides(a));
        const now = flips((a, prev) => chooseSides(a, prev));
        expect(now).toBeLessThan(old);
        // crossing the source once needs only a couple of real changes
        expect(now).toBeLessThanOrEqual(3);
    });

    it('still follows the target all the way across and back', () => {
        let prev: Sides | null = null;
        const seen = new Set<string>();
        for (const tx of [...range(600, -600, -10), ...range(-600, 600, 10)]) {
            prev = chooseSides(anchors(tx), prev);
            seen.add(`${prev.sourceSide}-${prev.targetSide}`);
        }
        expect(seen.has('right-left')).toBe(true);
        expect(seen.has('left-right')).toBe(true);
        // and it ends up on the facing sides again
        expect(prev).toEqual({ sourceSide: 'right', targetSide: 'left' });
    });
});

function range(from: number, to: number, step: number): number[] {
    const out: number[] = [];
    for (let v = from; step > 0 ? v <= to : v >= to; v += step) out.push(v);
    return out;
}
