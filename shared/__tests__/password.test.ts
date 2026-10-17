import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PASSWORD_MIN_LENGTH,
    PASSWORD_MAX_LENGTH,
    checkPassword,
    normalizeMinLength,
    passwordRules,
} from '../password';

const GOOD = 'Correct-Horse-9'; // 15 characters, with every kind

describe('checkPassword', () => {
    it('accepts a password that meets every rule', () => {
        expect(checkPassword(GOOD)).toEqual([]);
    });

    it('breaks only the length rule when it is the only thing missing', () => {
        expect(checkPassword('Ab1!')).toEqual(['min_length']);
        expect(checkPassword('Abcdefgh1!x')).toEqual(['min_length']); // 11
        expect(checkPassword('Abcdefgh1!xy')).toEqual([]); // 12
    });

    it('needs a capital letter', () => {
        expect(checkPassword('correct-horse-9')).toEqual(['uppercase']);
    });

    it('needs a number', () => {
        expect(checkPassword('Correct-Horse-x')).toEqual(['number']);
    });

    it('needs a symbol, and a space is not one', () => {
        expect(checkPassword('CorrectHorse99')).toEqual(['symbol']);
        expect(checkPassword('Correct Horse 99')).toEqual(['symbol']);
    });

    it('reports every broken rule at once, in checklist order', () => {
        expect(checkPassword('short')).toEqual([
            'min_length',
            'uppercase',
            'number',
            'symbol',
        ]);
    });

    it('rejects a password over the maximum', () => {
        const long = 'Aa1!' + 'x'.repeat(PASSWORD_MAX_LENGTH);
        expect(checkPassword(long)).toEqual(['max_length']);
        expect(checkPassword(long.slice(0, PASSWORD_MAX_LENGTH))).toEqual([]);
    });

    describe('Unicode', () => {
        it('counts a capital from another alphabet', () => {
            expect(checkPassword('éñ-straße-Ünï-9')).toEqual([]);
            expect(checkPassword('Ж-пароль-хороший-9')).toEqual([]);
            expect(checkPassword('ж-пароль-хороший-9')).toEqual(['uppercase']);
        });

        it('has no capital in an alphabet without case', () => {
            expect(checkPassword('パスワード-安全-です-9')).toEqual([
                'uppercase',
            ]);
        });

        it('counts a digit from another script', () => {
            expect(checkPassword('Correct-Horse-٣')).toEqual([]); // Arabic-Indic three
            expect(checkPassword('Correct-Horse-９')).toEqual([]); // full-width nine
        });

        it('does not take a letter-like number for a plain number', () => {
            // ² and ½ are numbers but not decimal digits
            expect(checkPassword('Correct-Horse-²')).toEqual(['number']);
        });

        it('counts a non-ASCII punctuation mark or emoji as a symbol', () => {
            expect(checkPassword('CorrectHorse9«')).toEqual([]);
            expect(checkPassword('CorrectHorse9🙂')).toEqual([]);
        });

        it('does not take a letter or a non-breaking space for a symbol', () => {
            expect(checkPassword('CorrectHorsé99')).toEqual(['symbol']);
            expect(checkPassword('Correct Horse 99')).toEqual(['symbol']);
        });
    });

    describe('minimum length setting', () => {
        it('uses the given minimum', () => {
            expect(checkPassword('Ab1!xxxx', { minLength: 8 })).toEqual([]);
            expect(checkPassword('Ab1!xxx', { minLength: 8 })).toEqual([
                'min_length',
            ]);
            expect(checkPassword(GOOD, { minLength: 20 })).toEqual([
                'min_length',
            ]);
        });

        it('cannot go below 8, whatever the setting says', () => {
            expect(checkPassword('Ab1!xxx', { minLength: 1 })).toEqual([
                'min_length',
            ]);
            expect(checkPassword('Ab1!xxxx', { minLength: 1 })).toEqual([]);
        });
    });

    describe('email', () => {
        const email = 'anna.smith@corp.io';

        it('is not checked when no email is given', () => {
            expect(checkPassword('Anna.smith-1234!')).toEqual([]);
        });

        it('rejects the address itself, in any case', () => {
            expect(checkPassword('ANNA.SMITH@corp.io1', { email })).toEqual([
                'email',
            ]);
        });

        it('rejects a password that contains the part before the @', () => {
            expect(checkPassword('My-Anna.Smith-99', { email })).toEqual([
                'email',
            ]);
        });

        it('allows a password that only shares a piece of it', () => {
            expect(checkPassword('My-Anna-Horse-99', { email })).toEqual([]);
        });

        it('ignores a very short part before the @', () => {
            expect(
                checkPassword('Ab-Horse-Staple-9', { email: 'ab@corp.io' })
            ).toEqual([]);
        });

        it('trims and lowercases the email it compares with', () => {
            expect(
                checkPassword('My-ANNA.smith-99', {
                    email: '  Anna.Smith@Corp.io ',
                })
            ).toEqual(['email']);
        });
    });
});

describe('passwordRules', () => {
    it('lists the rules a checklist shows, with the real minimum', () => {
        expect(passwordRules({ minLength: 14 }).map((r) => r.label)).toEqual([
            'At least 14 characters',
            'A capital letter',
            'A number',
            'A symbol, such as ! or #',
        ]);
    });

    it('adds the email rule only when there is an email', () => {
        expect(passwordRules().some((r) => r.id === 'email')).toBe(false);
        expect(passwordRules({ email: 'a@b.co' }).map((r) => r.id)).toContain(
            'email'
        );
    });

    it('lists every rule checkPassword can report except max_length', () => {
        const ids = passwordRules({ email: 'anna@corp.io' }).map((r) => r.id);
        expect(
            checkPassword('', { email: 'anna@corp.io' }).filter(
                (r) => r !== 'email'
            )
        ).toEqual(ids.filter((r) => r !== 'email'));
    });
});

describe('normalizeMinLength', () => {
    it('defaults to 12', () => {
        expect(normalizeMinLength(undefined)).toBe(DEFAULT_PASSWORD_MIN_LENGTH);
        expect(DEFAULT_PASSWORD_MIN_LENGTH).toBe(12);
        expect(normalizeMinLength(Number.NaN)).toBe(12);
    });

    it('clamps to between 8 and the maximum, and drops fractions', () => {
        expect(normalizeMinLength(3)).toBe(8);
        expect(normalizeMinLength(8)).toBe(8);
        expect(normalizeMinLength(15.9)).toBe(15);
        expect(normalizeMinLength(5000)).toBe(PASSWORD_MAX_LENGTH);
    });
});
