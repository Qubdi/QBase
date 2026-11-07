/** One entry of the language picker. */
export interface LanguageMetadata {
    /** English name. */
    name: string;
    /** Name in the language's own script. */
    nativeName: string;
    /** Locale file code, for example `de` or `zh_CN`. */
    code: string;
}
