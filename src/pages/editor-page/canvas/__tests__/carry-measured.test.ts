import { describe, expect, it } from 'vitest';
import { carryMeasured } from '../canvas-utils';

type N = {
    id: string;
    x: number;
    measured?: { width?: number; height?: number };
};

describe('carryMeasured', () => {
    it('gives a rebuilt node the size its previous version had', () => {
        const before: N[] = [
            { id: 'a', x: 0, measured: { width: 200, height: 90 } },
        ];
        const rebuilt: N[] = [{ id: 'a', x: 40 }];
        expect(carryMeasured(before, rebuilt)).toEqual([
            { id: 'a', x: 40, measured: { width: 200, height: 90 } },
        ]);
    });

    it('does not touch what it was given', () => {
        const before: N[] = [
            { id: 'a', x: 0, measured: { width: 1, height: 2 } },
        ];
        const rebuilt: N[] = [{ id: 'a', x: 5 }];
        carryMeasured(before, rebuilt);
        expect(rebuilt[0]).toEqual({ id: 'a', x: 5 });
    });

    it('keeps a size the new node already has', () => {
        const before: N[] = [
            { id: 'a', x: 0, measured: { width: 200, height: 90 } },
        ];
        const rebuilt: N[] = [
            { id: 'a', x: 0, measured: { width: 300, height: 120 } },
        ];
        expect(carryMeasured(before, rebuilt)[0].measured).toEqual({
            width: 300,
            height: 120,
        });
    });

    it('leaves a node that is new, or was never measured, as it is', () => {
        const before: N[] = [{ id: 'old', x: 0 }];
        const rebuilt: N[] = [
            { id: 'old', x: 1 },
            { id: 'brand-new', x: 2 },
        ];
        const result = carryMeasured(before, rebuilt);
        expect(result[0]).toBe(rebuilt[0]);
        expect(result[1]).toBe(rebuilt[1]);
    });

    it('matches by id, not by position in the list', () => {
        const before: N[] = [
            { id: 'a', x: 0, measured: { width: 1, height: 1 } },
            { id: 'b', x: 0, measured: { width: 2, height: 2 } },
        ];
        const rebuilt: N[] = [
            { id: 'b', x: 9 },
            { id: 'a', x: 9 },
        ];
        expect(
            carryMeasured(before, rebuilt).map((n) => n.measured?.width)
        ).toEqual([2, 1]);
    });

    it('drops nothing and invents nothing when a node has gone', () => {
        const before: N[] = [
            { id: 'a', x: 0, measured: { width: 1, height: 1 } },
            { id: 'gone', x: 0, measured: { width: 5, height: 5 } },
        ];
        const result = carryMeasured(before, [{ id: 'a', x: 3 }]);
        expect(result).toHaveLength(1);
        expect(result[0].measured).toEqual({ width: 1, height: 1 });
    });

    it('keeps the node unchanged when the rebuilt one is equal to the old one, so React can skip the update', () => {
        const before: N[] = [
            { id: 'a', x: 0, measured: { width: 1, height: 1 } },
        ];
        const rebuilt: N[] = [{ id: 'a', x: 0 }];
        expect(carryMeasured(before, rebuilt)).toEqual(before);
    });
});
