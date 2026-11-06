import React, { useContext, useEffect, useMemo, useState } from 'react';
import { LocalConfigContext } from '@/context/local-config-context/local-config-context';
import { ThemeContext } from './theme-context';
import { DARK_QUERY, resolveTheme, type ResolvedTheme } from './theme-utils';

/**
 * Applies the theme chosen in the LocalConfigProvider above it: the `dark`
 * class on <html>, and, for "system", a live follow of the OS setting.
 */
export const ThemeProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const { theme, setTheme } = useContext(LocalConfigContext);
    const [resolvedTheme, setResolved] = useState<ResolvedTheme>(() =>
        resolveTheme(theme)
    );

    useEffect(() => {
        const apply = () => {
            const next = resolveTheme(theme);
            setResolved(next);
            const root = document.documentElement;
            root.classList.toggle('dark', next === 'dark');
            root.style.colorScheme = next;
        };
        apply();
        if (theme !== 'system') return;
        let media: MediaQueryList;
        try {
            media = window.matchMedia(DARK_QUERY);
        } catch {
            return;
        }
        media.addEventListener('change', apply);
        return () => media.removeEventListener('change', apply);
    }, [theme]);

    const value = useMemo(
        () => ({ theme, resolvedTheme, setTheme }),
        [theme, resolvedTheme, setTheme]
    );
    return (
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
};
