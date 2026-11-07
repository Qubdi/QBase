import { describe, expect, it } from 'vitest';
import { revealShift } from './geometry';

const safe = { left: 12, top: 12, right: 1000, bottom: 700 };

describe('browser finding 1: revealShift keeps the edit card inside the safe area', () => {
    it('leaves a card that fits alone', () => {
        expect(
            revealShift({ left: 100, top: 100, right: 400, bottom: 500 }, safe)
        ).toEqual({ dx: 0, dy: 0 });
    });
    it('moves a card that runs under the toolbar up by the overhang', () => {
        expect(
            revealShift({ left: 100, top: 400, right: 400, bottom: 900 }, safe)
        ).toEqual({ dx: 0, dy: -200 });
    });
    it('moves a card at the right edge left', () => {
        expect(
            revealShift({ left: 800, top: 100, right: 1100, bottom: 300 }, safe)
        ).toEqual({ dx: -100, dy: 0 });
    });
    it('lines a card that is taller than the area up with the top', () => {
        expect(
            revealShift({ left: 100, top: 300, right: 400, bottom: 1500 }, safe)
        ).toEqual({ dx: 0, dy: -288 });
    });
    it('brings a card back that sits above the area', () => {
        expect(
            revealShift({ left: 100, top: -50, right: 400, bottom: 200 }, safe)
        ).toEqual({ dx: 0, dy: 62 });
    });
});
