import type { LanguageMetadata } from './types';

/**
 * The languages the editor offers. Only the names live here: each language's
 * translations are in `locales/` and are fetched when that language is used.
 */
export const languages: LanguageMetadata[] = [
    {
        name: 'English',
        nativeName: 'English',
        code: 'en',
    },
    {
        name: 'Russian',
        nativeName: 'Русский',
        code: 'ru',
    },
    {
        name: 'German',
        nativeName: 'Deutsch',
        code: 'de',
    },
    {
        name: 'Italian',
        nativeName: 'Italiano',
        code: 'it',
    },
    {
        name: 'French',
        nativeName: 'Français',
        code: 'fr',
    },
    {
        name: 'Chinese (Simplified)',
        nativeName: '简体中文',
        code: 'zh_CN',
    },
    {
        name: 'Chinese (Traditional)',
        nativeName: '繁體中文',
        code: 'zh_TW',
    },
];
