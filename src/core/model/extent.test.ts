import { describe, expect, it } from 'vitest';
import { maxBy, minBy } from './extent';

describe('minBy and maxBy', () => {
    it('match Math.min and Math.max, including for no items', () => {
        const items = [{ v: 3 }, { v: -2 }, { v: 7 }];
        expect(minBy(items, (i) => i.v)).toBe(-2);
        expect(maxBy(items, (i) => i.v)).toBe(7);
        expect(minBy([], () => 1)).toBe(Infinity);
        expect(maxBy([], () => 1)).toBe(-Infinity);
    });

    it('cope with arrays too big to spread into Math.min', () => {
        const big = Array.from({ length: 500_000 }, (_, i) => i);
        expect(() => Math.min(...big)).toThrow(RangeError);
        expect(minBy(big, (i) => i)).toBe(0);
        expect(maxBy(big, (i) => i)).toBe(499_999);
    });
});
