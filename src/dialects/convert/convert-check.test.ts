import { describe, expect, it } from 'vitest';
import { convertCheck } from './convert-check';

const quote = (n: string) => `"${n}"`;
const convert = (expression: string) =>
    convertCheck(expression, ['price', 'name'], quote, 'postgres', false);

describe('convertCheck refuses text that would break the statement', () => {
    it('converts an ordinary expression', () => {
        expect(convert("price > 0 AND name <> 'x'")).toEqual({
            text: `"price" > 0 AND "name" <> 'x'`,
        });
    });

    it.each([
        ['a line comment marker', 'price > 0 --'],
        ['a block comment opener', 'price > 0 /*'],
        ['a block comment closer', '*/ price > 0'],
        ['a lone quote', "price > 0 AND name = '"],
    ])('refuses %s', (_label, expression) => {
        expect(convert(expression)).toHaveProperty('reason');
    });

    it('keeps a quote that is doubled inside a string', () => {
        expect(convert("name = 'it''s'")).toEqual({
            text: `"name" = 'it''s'`,
        });
    });
});
