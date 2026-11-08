import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LastSaved } from '../last-saved';

const updatedAt = new Date(Date.now() - 5 * 60 * 1000);
const language = vi.hoisted(() => ({ current: 'en' }));

vi.mock('@/qbase/use-diagram', () => ({
    useDiagram: () => ({ currentDiagram: { updatedAt } }),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ i18n: { language: language.current } }),
}));

const text = (lang: string) => {
    language.current = lang;
    const { unmount } = render(<LastSaved />);
    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    unmount();
    return label;
};

describe('time ago in the save hover text (SHL-030)', () => {
    it('is English in English', () => {
        expect(text('en')).toBe('Saved 5 minutes ago');
    });

    it.each(['fr', 'de', 'it', 'ru'])(
        '%s: the "time ago" words are in that language',
        (lang) => {
            const label = text(lang);
            expect(label, lang).not.toContain('minutes ago');
        }
    );
});

describe('which languages have the wording (SHL-030)', () => {
    it('a regional code uses its base language; German as de-AT, Italian as it_CH', () => {
        expect(text('de-AT')).not.toContain('minutes ago');
        expect(text('it_CH')).not.toContain('minutes ago');
    });

    it('a language without wording reads English', () => {
        for (const lang of ['tr', 'uk', 'es', 'ja'])
            expect(text(lang), lang).toContain('5 minutes ago');
    });
});
