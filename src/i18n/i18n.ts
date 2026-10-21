import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { en } from './locales/en';
import { languages } from './languages';

export { languages };

/** English is bundled: it is the fallback for every other language. */
const FALLBACK = 'en';

/**
 * The other languages are separate chunks, fetched the first time they are
 * wanted, so the bundle holds one language instead of twenty-two.
 */
const loaders = import.meta.glob<Record<string, { translation: object }>>([
    './locales/*.ts',
    '!./locales/en.ts',
]);

/** Locale files that may serve `lng`: itself, then its base language ('fr-FR' -> 'fr'). */
const candidates = (lng: string) => [...new Set([lng, lng.split('-')[0]])];

/** Fetches the translations for `lng` if they are not here yet; true when it added any. */
async function ensureLocale(lng: string | undefined): Promise<boolean> {
    if (!lng) return false;
    for (const code of candidates(lng)) {
        if (code === FALLBACK || i18n.hasResourceBundle(code, 'translation')) {
            return false;
        }
        const load = loaders[`./locales/${code}.ts`];
        if (!load) continue;
        const locale = (await load())[code];
        i18n.addResourceBundle(
            code,
            'translation',
            locale.translation,
            true,
            true
        );
        return true;
    }
    return false;
}

/** Tells the browser which way the page reads (Arabic is right to left) and in what language. */
function setDocumentLanguage(lng: string) {
    document.documentElement.lang = lng.replace('_', '-');
    document.documentElement.dir = i18n.dir(lng);
}

// The language changes (at start, from the detector, and when the person picks
// one): fetch its translations, then switch again so every screen redraws.
i18n.on('languageChanged', (lng) => {
    setDocumentLanguage(lng);
    void ensureLocale(lng)
        .then(async (added) => {
            if (added) await i18n.changeLanguage(lng);
        })
        .catch(() => undefined);
});

/** Settles once the first screen can be shown in the person's language. */
export const i18nReady: Promise<void> = i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: { en },
        interpolation: {
            escapeValue: false,
        },
        fallbackLng: FALLBACK,
        debug: false,
    })
    .then(() => ensureLocale(i18n.language))
    .then(() => undefined)
    .catch(() => undefined);

export { i18n };
