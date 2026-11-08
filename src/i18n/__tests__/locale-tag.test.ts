import { describe, expect, it } from 'vitest';
import { localeTag } from '@/i18n/locale-tag';

describe('localeTag', () => {
    it('keeps a normal code', () => {
        expect(localeTag('en')).toBe('en');
        expect(localeTag('pt-BR')).toBe('pt-BR');
    });
    it('cleans codes taken from the system locale', () => {
        expect(localeTag('en-US@posix')).toBe('en-US');
        expect(localeTag('en_US.UTF-8')).toBe('en-US');
        expect(localeTag('pt_BR')).toBe('pt-BR');
    });
    it('gives undefined for what Intl cannot use', () => {
        expect(localeTag('not a tag!')).toBeUndefined();
        expect(localeTag('')).toBeUndefined();
        expect(localeTag(undefined)).toBeUndefined();
    });
    it('never makes toLocaleString throw', () => {
        for (const code of ['en-US@posix', 'C', 'dev', 'x']) {
            expect(() =>
                new Date(0).toLocaleString(localeTag(code))
            ).not.toThrow();
        }
    });
});
