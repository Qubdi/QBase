import { describe, expect, it } from 'vitest';
import { plainStringDefault } from './defaults';

describe('plainStringDefault (CLI-129)', () => {
    it.each([
        ["'it\\'s'", "'it''s'"],
        ["'C:\\\\'", "'C:\\'"],
        ["'a\\nb'", "'a\nb'"],
        ["'50\\%'", "'50\\%'"],
        ["'a''b'", "'a''b'"],
        ["'plain'", "'plain'"],
        ["''", "''"],
    ])('%s becomes %s', (written, plain) => {
        expect(plainStringDefault(written)).toBe(plain);
    });

    it('leaves anything that is not one string as it is', () => {
        for (const text of [
            "CONCAT('a\\'b', 'c')",
            "'a' 'b'",
            "'open",
            '42',
            'NOW()',
        ])
            expect(plainStringDefault(text)).toBe(text);
    });
});
