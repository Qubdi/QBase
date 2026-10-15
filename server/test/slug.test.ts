import { describe, expect, it } from 'vitest';
import { RESERVED_SLUGS, slugFor, slugify } from '../src/projects/slug.js';

describe('slugify', () => {
    it('keeps the case and joins words with dashes', () => {
        expect(slugify('Qubdi')).toBe('Qubdi');
        expect(slugify('My Team')).toBe('My-Team');
        expect(slugify('  spaced   out  ')).toBe('spaced-out');
    });

    it('drops characters that do not belong in a URL', () => {
        expect(slugify('Billing & Payments (EU)')).toBe('Billing-Payments-EU');
        expect(slugify('a/b\\c?d#e')).toBe('abcde');
        expect(slugify('--edge--')).toBe('edge');
        expect(slugify('v1.2_beta')).toBe('v1.2_beta');
    });

    it('keeps letters and digits from any language', () => {
        expect(slugify('მერმე')).toBe('მერმე');
        expect(slugify('Проект 2')).toBe('Проект-2');
    });

    it('returns an empty string when nothing usable is left', () => {
        expect(slugify('   ')).toBe('');
        expect(slugify('!!!')).toBe('');
        expect(slugify('---')).toBe('');
    });
});

describe('slugFor', () => {
    it('accepts ordinary names', () => {
        expect(slugFor('Merme')).toEqual({ ok: true, slug: 'Merme' });
    });

    it('rejects names that produce no slug', () => {
        expect(slugFor('???')).toEqual({ ok: false, error: 'invalid_name' });
    });

    it('rejects names that would shadow an app path, in any case', () => {
        for (const reserved of RESERVED_SLUGS) {
            expect(slugFor(reserved)).toEqual({
                ok: false,
                error: 'reserved_name',
            });
            expect(slugFor(reserved.toUpperCase())).toEqual({
                ok: false,
                error: 'reserved_name',
            });
        }
        expect(slugFor('Admin!')).toEqual({ ok: false, error: 'reserved_name' });
    });

    it('allows names that only contain a reserved word', () => {
        expect(slugFor('Admin Tools')).toEqual({ ok: true, slug: 'Admin-Tools' });
    });
});
