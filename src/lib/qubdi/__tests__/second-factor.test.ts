import { describe, expect, it } from 'vitest';
import { codeDigits, factorFrom, isCode, spacedKey } from '../second-factor';

describe('second factor', () => {
    it('reads six digits, with or without a space, as a code from the app', () => {
        expect(isCode('123456')).toBe(true);
        expect(isCode(' 123 456 ')).toBe(true);
        expect(codeDigits('123 456')).toBe('123456');
        expect(factorFrom('123 456')).toEqual({ code: '123456' });
    });

    it('reads anything else as a recovery code', () => {
        expect(isCode('12345')).toBe(false);
        expect(isCode('1234567')).toBe(false);
        expect(factorFrom(' abcde-fghjk ')).toEqual({
            recoveryCode: 'abcde-fghjk',
        });
        expect(factorFrom('12345a')).toEqual({ recoveryCode: '12345a' });
    });

    it('shows the key in groups of four', () => {
        expect(spacedKey('ABCDEFGHIJKLMNOP')).toBe('ABCD EFGH IJKL MNOP');
    });
});
