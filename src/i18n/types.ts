import type { en } from './locales/en';

type English = typeof en;

/**
 * What a language file holds. Everything but the Qubdi screens must be there;
 * those (`qubdi`) may be missing or partial and fall back to English.
 */
export type LanguageTranslation = {
    translation: Omit<English['translation'], 'qubdi'> & {
        qubdi?: DeepPartial<English['translation']['qubdi']>;
    };
};

type DeepPartial<T> = { [K in keyof T]?: DeepPartial<T[K]> };

export type LanguageMetadata = {
    name: string;
    nativeName: string;
    code: string;
};
