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
