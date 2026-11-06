export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Same key as public/theme-init.js, which sets the class before first paint. */
export const THEME_KEY = 'theme';

export const DARK_QUERY = '(prefers-color-scheme: dark)';

export const parseTheme = (value: string | null): Theme =>
    value === 'light' || value === 'dark' || value === 'system'
        ? value
        : 'system';

const systemIsDark = (): boolean => {
    try {
        return window.matchMedia(DARK_QUERY).matches;
    } catch {
        return false;
    }
};

export const resolveTheme = (theme: Theme): ResolvedTheme =>
    theme === 'system' ? (systemIsDark() ? 'dark' : 'light') : theme;
