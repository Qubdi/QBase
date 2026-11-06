import { createContext, useContext } from 'react';
import type { ResolvedTheme, Theme } from './theme-utils';

export interface ThemeContextValue {
    theme: Theme;
    resolvedTheme: ResolvedTheme;
    setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
    theme: 'system',
    resolvedTheme: 'light',
    setTheme: () => undefined,
});

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);
