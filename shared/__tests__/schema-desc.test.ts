import { describe, expect, it } from 'vitest';
import { canonicalType } from '../schema-desc';

// the earlier implementation, kept here to prove the loop answers the same
const ALIASES: Record<string, string> = {
    int4: 'integer',
    int: 'integer',
    'character varying': 'varchar',
};
const regexOnly = (raw: string): { base: string; arrays: string } => {
    const lower = raw
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/_/g, ' ');
    const arrays = lower.match(/(\[\])+$/)?.[0] ?? '';
    return {
        base: lower.slice(0, lower.length - arrays.length).trim(),
        arrays,
    };
};

describe('canonicalType array suffix', () => {
    it('keeps the trailing [] run and maps the base', () => {
        expect(canonicalType('INT4[]')).toBe('integer[]');
        expect(canonicalType('int[][]')).toBe('integer[][]');
        expect(canonicalType('character_varying[]')).toBe('varchar[]');
        expect(canonicalType('text')).toBe('text');
    });

    it('answers like the regex on random inputs', () => {
        let seed = 7;
        const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
        const pieces = ['[]', '[', ']', 'int4', ' ', '_', 'x', 'INT'];
        for (let n = 0; n < 500; n++) {
            let s = '';
            const len = next() % 8;
            for (let k = 0; k < len; k++) s += pieces[next() % pieces.length];
            const { base, arrays } = regexOnly(s);
            expect(canonicalType(s)).toBe(`${ALIASES[base] ?? base}${arrays}`);
        }
    });

    it('does not hang on a very long run of []', () => {
        const long = '[]'.repeat(50_000) + 'x';
        const start = performance.now();
        canonicalType(long);
        canonicalType('[]'.repeat(50_000));
        expect(performance.now() - start).toBeLessThan(100);
    });
});
