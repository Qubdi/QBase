import React, { useContext } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRoutes } from '@/platform/router/router';
import { ThemeProvider } from '@/platform/theme/theme-provider';
import { useTheme } from '@/platform/theme/theme-context';
import { LocalConfigContext } from '../local-config-context';
import { LocalConfigProvider } from '../local-config-provider';

const Dump: React.FC = () => {
    const c = useContext(LocalConfigContext);
    return (
        <div>
            <span data-testid="state">
                {JSON.stringify({
                    theme: c.theme,
                    scroll: c.scrollAction,
                    views: c.showDbViews,
                    cardinality: c.showCardinality,
                    attributes: c.showFieldAttributes,
                    compact: c.compactTables,
                    minimap: c.showMinimap,
                })}
            </span>
            <button onClick={() => c.setTheme('dark')}>theme</button>
            <button onClick={() => c.setScrollAction('zoom')}>scroll</button>
            <button onClick={() => c.setShowDbViews(true)}>views</button>
            <button onClick={() => c.setShowCardinality(false)}>
                cardinality
            </button>
            <button onClick={() => c.setShowFieldAttributes(false)}>
                attributes
            </button>
            <button onClick={() => c.setCompactTables(true)}>compact</button>
            <button onClick={() => c.setShowMinimap(false)}>minimap</button>
        </div>
    );
};
const state = () => JSON.parse(screen.getByTestId('state').textContent!);

beforeEach(() => localStorage.clear());
afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('settings (SHL-080 to SHL-084)', () => {
    it('SHL-080: there is no settings page', () => {
        for (const backend of [false, true]) {
            const paths = buildRoutes(backend).map((r) => r.path);
            expect(
                paths.filter((p) => /setting|preferences/i.test(p ?? ''))
            ).toEqual([]);
        }
    });

    it('SHL-081: with nothing saved the defaults of the spec apply', () => {
        render(
            <LocalConfigProvider>
                <Dump />
            </LocalConfigProvider>
        );
        expect(state()).toEqual({
            theme: 'system',
            scroll: 'pan',
            views: false,
            cardinality: true,
            attributes: true,
            compact: false,
            minimap: true,
        });
    });

    it('SHL-081: every setting is written under its own key', () => {
        render(
            <LocalConfigProvider>
                <Dump />
            </LocalConfigProvider>
        );
        for (const name of [
            'theme',
            'scroll',
            'views',
            'cardinality',
            'attributes',
            'compact',
            'minimap',
        ])
            fireEvent.click(screen.getByText(name));
        expect(localStorage.getItem('theme')).toBe('dark');
        expect(localStorage.getItem('scroll_action')).toBe('zoom');
        expect(localStorage.getItem('show_db_views')).toBe('true');
        expect(localStorage.getItem('show_cardinality')).toBe('false');
        expect(localStorage.getItem('show_field_attributes')).toBe('false');
        expect(localStorage.getItem('compact_tables')).toBe('true');
        expect(localStorage.getItem('show_minimap_on_canvas')).toBe('false');
    });

    it('SHL-081 and SHL-082: all of them, field attributes included, come back after a reload', () => {
        const first = render(
            <LocalConfigProvider>
                <Dump />
            </LocalConfigProvider>
        );
        for (const name of [
            'theme',
            'scroll',
            'views',
            'cardinality',
            'attributes',
            'compact',
            'minimap',
        ])
            fireEvent.click(screen.getByText(name));
        first.unmount();
        render(
            <LocalConfigProvider>
                <Dump />
            </LocalConfigProvider>
        );
        expect(state()).toEqual({
            theme: 'dark',
            scroll: 'zoom',
            views: true,
            cardinality: false,
            attributes: false,
            compact: true,
            minimap: false,
        });
    });

    it('SHL-081: a stored value that is not valid falls back to the default', () => {
        localStorage.setItem('theme', 'purple');
        localStorage.setItem('scroll_action', 'sideways');
        localStorage.setItem('show_cardinality', 'maybe');
        render(
            <LocalConfigProvider>
                <Dump />
            </LocalConfigProvider>
        );
        expect(state()).toMatchObject({
            theme: 'system',
            scroll: 'pan',
            cardinality: true,
        });
    });

    it('SHL-083: a browser that refuses storage opens with the defaults and keeps changes until reload', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('refused');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('refused');
        });
        render(
            <LocalConfigProvider>
                <Dump />
            </LocalConfigProvider>
        );
        expect(state()).toMatchObject({
            theme: 'system',
            cardinality: true,
            attributes: true,
        });
        fireEvent.click(screen.getByText('attributes'));
        expect(state().attributes).toBe(false);
    });
});

describe('theme (SHL-085, SHL-086)', () => {
    const osTheme = (dark: boolean) => {
        const listeners = new Set<() => void>();
        const media = {
            matches: dark,
            addEventListener: (_: string, l: () => void) => listeners.add(l),
            removeEventListener: (_: string, l: () => void) =>
                listeners.delete(l),
        };
        vi.stubGlobal('matchMedia', () => media);
        return (next: boolean) => {
            media.matches = next;
            listeners.forEach((l) => l());
        };
    };
    const isDark = () => document.documentElement.classList.contains('dark');
    const Buttons: React.FC = () => {
        const { theme, resolvedTheme, setTheme } = useTheme();
        return (
            <div>
                <span data-testid="t">
                    {theme}/{resolvedTheme}
                </span>
                {(['light', 'dark', 'system'] as const).map((t) => (
                    <button key={t} onClick={() => setTheme(t)}>
                        {t}
                    </button>
                ))}
            </div>
        );
    };
    const mount = () =>
        render(
            <LocalConfigProvider>
                <ThemeProvider>
                    <Buttons />
                </ThemeProvider>
            </LocalConfigProvider>
        );

    it('SHL-085: Light and Dark set or clear the dark class on the root element', () => {
        osTheme(false);
        mount();
        expect(isDark()).toBe(false);
        fireEvent.click(screen.getByText('dark'));
        expect(isDark()).toBe(true);
        expect(document.documentElement.style.colorScheme).toBe('dark');
        fireEvent.click(screen.getByText('light'));
        expect(isDark()).toBe(false);
    });

    it('SHL-085: System follows the operating system, live', () => {
        const change = osTheme(false);
        mount();
        expect(screen.getByTestId('t').textContent).toBe('system/light');
        act(() => change(true));
        expect(isDark()).toBe(true);
        expect(screen.getByTestId('t').textContent).toBe('system/dark');
        act(() => change(false));
        expect(isDark()).toBe(false);
    });

    it('SHL-085: a fixed theme ignores the operating system', () => {
        const change = osTheme(false);
        mount();
        fireEvent.click(screen.getByText('light'));
        act(() => change(true));
        expect(isDark()).toBe(false);
    });
});
