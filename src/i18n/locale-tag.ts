/**
 * A language code that `Intl` accepts. The browser can report codes such as
 * 'en-US@posix' or 'en_US.UTF-8' (taken from the system locale), and those make
 * `toLocaleString` throw a RangeError; the code is cleaned, and anything still
 * invalid gives `undefined`, which means the browser's own default.
 */
export function localeTag(language: string | undefined): string | undefined {
    if (!language) return undefined;
    const cleaned = language.split(/[@.]/)[0].replace(/_/g, '-');
    try {
        return Intl.getCanonicalLocales(cleaned)[0];
    } catch {
        return undefined;
    }
}
