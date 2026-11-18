import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/i18n/i18n';
import { LastSaved } from '../last-saved';

const updatedAt = new Date(Date.now() - 5 * 60 * 1000);

vi.mock('@/qbase/use-diagram', () => ({
    useDiagram: () => ({ currentDiagram: { updatedAt } }),
}));

// The other languages arrive as separate files after the switch, so each read
// waits until the text no longer says "minutes ago" (or, for a language with
// no file, until it has had its chance to).
const text = async (lang: string, translated: boolean) => {
    await i18n.changeLanguage(lang);
    const { unmount } = render(<LastSaved />);
    const label = () =>
        screen.getByRole('img').getAttribute('aria-label') ?? '';
    if (translated)
        await waitFor(() => expect(label()).not.toContain('minutes ago'));
    const out = label();
    unmount();
    return out;
};

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('time ago in the save hover text (SHL-030)', () => {
    it('is English in English', async () => {
        expect(await text('en', false)).toBe('Saved 5 minutes ago');
    });

    it.each(['fr', 'de', 'it', 'ru'])(
        '%s: the "time ago" words are in that language',
        async (lang) => {
            expect(await text(lang, true), lang).not.toContain('minutes ago');
        }
    );
});

describe('which languages have the wording (SHL-030)', () => {
    it('a regional code uses its base language; German as de-AT', async () => {
        expect(await text('de-AT', true)).not.toContain('minutes ago');
    });

    it('a language without wording reads English', async () => {
        for (const lang of ['tr', 'uk', 'es', 'ja'])
            expect(await text(lang, false), lang).toContain('5 minutes ago');
    });
});
