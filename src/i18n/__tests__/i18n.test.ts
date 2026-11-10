import { describe, expect, it } from 'vitest';
import { i18n, i18nReady, languages } from '../i18n';
import { languages as listed } from '../languages';
import { fr } from '../locales/fr';

describe('languages', () => {
    it('lists the 5 languages the editor offers, English first, each once', () => {
        expect(languages).toBe(listed);
        expect(languages).toHaveLength(5);
        expect(languages[0]).toEqual({
            name: 'English',
            nativeName: 'English',
            code: 'en',
        });
        const codes = languages.map((l) => l.code);
        expect(new Set(codes).size).toBe(codes.length);
        for (const l of languages) {
            expect(l.name && l.nativeName && l.code).toBeTruthy();
        }
    });
});

describe('lazy translations', () => {
    it('starts with English only', async () => {
        await i18nReady;
        expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
        expect(i18n.hasResourceBundle('fr', 'translation')).toBe(false);
        expect(i18n.hasResourceBundle('ja', 'translation')).toBe(false);
    });

    it('fetches a language when it is chosen, and then speaks it', async () => {
        await i18n.changeLanguage('fr');
        await expect
            .poll(() => i18n.hasResourceBundle('fr', 'translation'))
            .toBe(true);
        await expect
            .poll(() => i18n.t('editor.common.cancel'))
            .toBe(fr.translation.editor.common.cancel);
        expect(i18n.t('editor.common.cancel')).not.toBe('Cancel');
        // the other languages were not touched
        expect(i18n.hasResourceBundle('ja', 'translation')).toBe(false);
    });

    it('does not switch back to a language that finished loading late', async () => {
        void i18n.changeLanguage('it');
        await i18n.changeLanguage('en');
        await expect
            .poll(() => i18n.hasResourceBundle('it', 'translation'))
            .toBe(true);
        await new Promise((r) => setTimeout(r, 20));
        expect(i18n.language).toBe('en');
    });

    it('falls back to English for a language it has no file for', async () => {
        await i18n.changeLanguage('xx');
        await i18n.changeLanguage('en');
        expect(i18n.t('editor.common.cancel')).toBe('Cancel');
    });

    it('serves a regional code from its base language file', async () => {
        await i18n.changeLanguage('de-AT');
        await expect
            .poll(() => i18n.hasResourceBundle('de', 'translation'))
            .toBe(true);
    });
});

describe('document direction', () => {
    const dir = () => document.documentElement.dir;

    it('reads right to left in Arabic and left to right in the others', async () => {
        await i18n.changeLanguage('ar');
        expect(dir()).toBe('rtl');
        expect(document.documentElement.lang).toBe('ar');
        await i18n.changeLanguage('en');
        expect(dir()).toBe('ltr');
        expect(document.documentElement.lang).toBe('en');
        await i18n.changeLanguage('ja');
        expect(dir()).toBe('ltr');
    });

    it('writes a locale code with an underscore the way HTML expects it', async () => {
        await i18n.changeLanguage('pt_BR');
        expect(document.documentElement.lang).toBe('pt-BR');
        await i18n.changeLanguage('en');
    });
});

describe('the server screens in other languages', () => {
    it('show their English text until a language translates them', async () => {
        const english = i18n.getFixedT('en')(
            'qubdi.adminUsers.sessions.unknownBrowser'
        );
        expect(english).toBe('Unknown browser');
        await i18n.changeLanguage('fr');
        await expect
            .poll(() => i18n.hasResourceBundle('fr', 'translation'))
            .toBe(true);
        // French has no `qubdi` text yet: the key must still read as English
        expect(i18n.t('qubdi.adminUsers.sessions.unknownBrowser')).toBe(
            english
        );
        await i18n.changeLanguage('en');
    });
});
