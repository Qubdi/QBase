import { describe, expect, it } from 'vitest';
import { msUntilAgeChanges } from './next-tick';

const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

describe('msUntilAgeChanges', () => {
    it('ticks every second while the age reads in seconds', () => {
        expect(msUntilAgeChanges(0)).toBeLessThanOrEqual(S + 20);
        expect(msUntilAgeChanges(5 * S)).toBeLessThanOrEqual(S + 20);
        expect(msUntilAgeChanges(5 * S + 400)).toBe(600 + 20);
        expect(msUntilAgeChanges(59 * S)).toBeLessThanOrEqual(S + 20);
    });

    it('waits for the turn of the minute while it reads in minutes', () => {
        expect(msUntilAgeChanges(M)).toBe(M + 20);
        expect(msUntilAgeChanges(M + 15 * S)).toBe(45 * S + 20);
        expect(msUntilAgeChanges(59 * M + 59 * S)).toBe(S + 20);
    });

    it('waits for the turn of the hour while it reads in hours', () => {
        expect(msUntilAgeChanges(H)).toBe(H + 20);
        expect(msUntilAgeChanges(2 * H + 30 * M)).toBe(30 * M + 20);
    });

    it('waits for the turn of the day after that, however old', () => {
        expect(msUntilAgeChanges(D)).toBe(D + 20);
        expect(msUntilAgeChanges(3 * D + 6 * H)).toBe(18 * H + 20);
        expect(msUntilAgeChanges(400 * D)).toBe(D + 20);
    });

    it('treats a time in the future as just now', () => {
        expect(msUntilAgeChanges(-5 * S)).toBeLessThanOrEqual(S + 20);
    });
});
