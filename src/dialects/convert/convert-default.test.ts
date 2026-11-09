import { describe, expect, it } from 'vitest';
import { convertDefault } from './convert-default';

import type { Neutral } from './contract';

const textArray: Neutral = {
    kind: 'array',
    of: { kind: 'text', size: 'regular' },
};

describe('an array default written as JSON for a target without arrays', () => {
    it('doubles a quote inside an item so the literal stays closed', () => {
        expect(convertDefault(`'{"it''s"}'`, textArray, 'sqlserver')).toEqual({
            text: `'["it''s"]'`,
        });
    });

    it('does the same for MySQL, inside its parentheses', () => {
        expect(convertDefault(`'{"it''s"}'`, textArray, 'mysql')).toEqual({
            text: `('["it''s"]')`,
        });
    });
});

describe('an ARRAY[...] default', () => {
    it('keeps quotes and numbers when written as JSON', () => {
        expect(
            convertDefault(`ARRAY['a', 'it''s', 3]`, textArray, 'sqlserver')
        ).toEqual({ text: `'["a", "it''s", 3]'` });
    });

    it('ignores a trailing cast on the list', () => {
        expect(
            convertDefault(`ARRAY['a','b']::text[]`, textArray, 'sqlserver')
        ).toEqual({ text: `'["a", "b"]'` });
    });

    it('is written as an array literal for PostgreSQL, quoting what needs it', () => {
        expect(
            convertDefault(
                `ARRAY['a', 'two words', 'x"y']`,
                textArray,
                'postgres'
            )
        ).toEqual({ text: `'{a,"two words","x\\"y"}'` });
    });

    it('is not converted when it holds something other than literals', () => {
        const res = convertDefault(`ARRAY[now()]`, textArray, 'sqlserver');
        expect(res.text).toBeUndefined();
        expect(res.note).toContain('not converted');
    });
});
