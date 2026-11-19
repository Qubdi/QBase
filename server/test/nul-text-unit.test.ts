import { describe, expect, it } from 'vitest';
import { containsNul } from '../src/lib/depth.js';
import { isUnstorableText } from '../src/lib/pg-errors.js';

describe('containsNul (SRV-047)', () => {
    it('finds a NUL in a string, a key, or anywhere inside arrays and objects', () => {
        expect(containsNul('a\u0000b')).toBe(true);
        expect(containsNul({ ['k\u0000']: 1 })).toBe(true);
        expect(
            containsNul({ tables: [{ name: 'x', notes: ['ok', 'a\u0000'] }] })
        ).toBe(true);
    });

    it('leaves ordinary content alone, including the text backslash-u0000', () => {
        expect(
            containsNul({
                name: 'plain',
                n: 3,
                ok: true,
                none: null,
                list: [1, 'two'],
            })
        ).toBe(false);
        expect(containsNul('\\u0000')).toBe(false);
    });

    it('does not recurse, so very deep content cannot overflow the stack', () => {
        let deep: unknown = 'x';
        for (let i = 0; i < 50_000; i++) deep = [deep];
        expect(containsNul(deep)).toBe(false);
    });

    it('copes with a very wide array', () => {
        expect(containsNul(new Array(500_000).fill('x'))).toBe(false);
    });
});

describe('isUnstorableText (SRV-047)', () => {
    it('knows the two Postgres codes, on the error or its cause', () => {
        expect(isUnstorableText({ code: '22021' })).toBe(true);
        expect(
            isUnstorableText(new Error('wrapped', { cause: { code: '22P05' } }))
        ).toBe(true);
    });

    it('does not take other errors for it', () => {
        expect(isUnstorableText({ code: '23505' })).toBe(false);
        expect(isUnstorableText(new Error('plain'))).toBe(false);
        expect(isUnstorableText(undefined)).toBe(false);
    });
});
