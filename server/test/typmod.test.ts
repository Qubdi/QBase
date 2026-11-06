import { describe, expect, it } from 'vitest';
import { decodeTypmod } from '../src/introspect/typmod.js';

// numeric(p, s) is stored as ((p << 16) | (s & 0x7ff)) + 4 (PostgreSQL 15 keeps the scale in 11 signed bits)
const numeric = (p: number, s: number) => ((p << 16) | (s & 0x7ff)) + 4;

describe('numeric typmod', () => {
    it('decodes an ordinary scale', () => {
        expect(decodeTypmod('numeric', numeric(10, 2)).precision).toEqual({ precision: 10, scale: 2 });
        expect(decodeTypmod('numeric', numeric(5, 0)).precision).toEqual({ precision: 5, scale: 0 });
        expect(decodeTypmod('decimal', numeric(38, 10)).precision).toEqual({ precision: 38, scale: 10 });
    });

    it('decodes a negative scale (PostgreSQL 15) as negative, not as 2046', () => {
        expect(decodeTypmod('numeric', numeric(5, -2)).precision).toEqual({ precision: 5, scale: -2 });
        expect(decodeTypmod('numeric', numeric(3, -1)).precision).toEqual({ precision: 3, scale: -1 });
        expect(decodeTypmod('numeric', numeric(1000, -1000)).precision).toEqual({ precision: 1000, scale: -1000 });
    });

    it('decodes the largest positive scale', () => {
        expect(decodeTypmod('numeric', numeric(1000, 1000)).precision).toEqual({ precision: 1000, scale: 1000 });
    });

    it('still reads no typmod as no precision', () => {
        expect(decodeTypmod('numeric', -1).precision).toBeNull();
    });
});
