import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/i18n/i18n';
import { LanguageButton } from '../navbar/language-button';
import { renderInEditor } from './test-harness';

beforeAll(() => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => undefined;
    Element.prototype.scrollIntoView ??= () => undefined;
});
afterEach(async () => {
    await i18n.changeLanguage('en');
});

const open = async () => {
    renderInEditor(<LanguageButton />, null, '/');
    fireEvent.click(screen.getByRole('button', { name: 'Change language' }));
    const panel = await screen.findByRole('dialog', {
        name: 'Change language',
    });
    // the panel shows the current language; its box opens the list
    fireEvent.click(within(panel).getByRole('combobox'));
    return panel;
};

describe('language button (SHL-093, SHL-096)', () => {
    it('SHL-093: lists 5 languages, English first, each with its native name and its English name', async () => {
        const menu = await open();
        const items = within(menu).getAllByRole('radio');
        expect(items).toHaveLength(5);
        expect(items[0].textContent).toBe('English');
        const french = items.find((i) => i.textContent?.includes('Français'))!;
        expect(french.textContent).toBe('Français (French)');
        const ru = items.find((i) => i.textContent?.includes('Русский'))!;
        expect(ru.textContent).toBe('Русский (Russian)');
    });

    it('SHL-096: the button is the globe named "Change language"; the list can be searched by either name', async () => {
        const menu = await open();
        const search = within(menu).getByRole('searchbox');
        fireEvent.change(search, { target: { value: 'germ' } });
        expect(
            within(menu)
                .getAllByRole('radio')
                .map((i) => i.textContent)
        ).toEqual(['Deutsch (German)']);
        fireEvent.change(search, { target: { value: 'Italia' } });
        expect(
            within(menu)
                .getAllByRole('radio')
                .map((i) => i.textContent)
        ).toEqual(['Italiano (Italian)']);
    });

    it('SHL-096: a choice applies at once, with no reload, closes the list and is remembered', async () => {
        const menu = await open();
        fireEvent.click(within(menu).getByRole('radio', { name: /Deutsch/ }));
        await waitFor(() => expect(i18n.language).toBe('de'));
        expect(document.documentElement.lang).toBe('de');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(localStorage.getItem('i18nextLng')).toBe('de');
    });
});

describe('which language starts (SHL-094)', () => {
    const fresh = async () => {
        vi.resetModules();
        const mod = await import('@/i18n/i18n');
        await mod.i18nReady;
        return mod.i18n;
    };
    afterEach(() => {
        localStorage.clear();
        document.cookie = 'i18nextLng=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        window.history.replaceState(null, '', '/');
        vi.unstubAllGlobals();
    });

    it('a saved choice in localStorage wins over the browser list', async () => {
        localStorage.setItem('i18nextLng', 'ja');
        expect((await fresh()).language).toBe('ja');
    });

    it('a lng parameter in the address wins over everything saved', async () => {
        localStorage.setItem('i18nextLng', 'ja');
        window.history.replaceState(null, '', '/?lng=fr');
        expect((await fresh()).language).toBe('fr');
    });

    it('the browser list is used when nothing is saved, and the choice is then remembered', async () => {
        localStorage.clear();
        vi.stubGlobal('navigator', {
            ...window.navigator,
            languages: ['es-MX', 'en'],
            language: 'es-MX',
        });
        const instance = await fresh();
        expect(instance.language.startsWith('es')).toBe(true);
        expect(localStorage.getItem('i18nextLng')).toBeTruthy();
    });
});
