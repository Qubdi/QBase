import { describe, expect, it } from 'vitest';
import { selectBoxFilter } from '../select-box';

describe('selectBoxFilter', () => {
    it('keeps a value or keyword that contains the text, in any case', () => {
        expect(selectBoxFilter('varchar', 'CHAR')).toBe(1);
        expect(selectBoxFilter('id-1', 'x', ['alpha', 'Xylophone'])).toBe(1);
        expect(selectBoxFilter('varchar', 'int')).toBe(0);
        expect(selectBoxFilter('varchar', 'int', ['text', 'bigint'])).toBe(1);
    });

    it('does not read a keyword as a pattern, so enum values with regex characters are safe', () => {
        for (const keyword of ['a+b', '(x', '[y', '*', '?', '\\']) {
            expect(() => selectBoxFilter('id', 'q', [keyword])).not.toThrow();
            expect(selectBoxFilter('id', 'q', [keyword])).toBe(0);
        }
        // "a+" as a pattern would match "aaa"; as plain text it must not
        expect(selectBoxFilter('id', 'aaa', ['a+'])).toBe(0);
    });
});
