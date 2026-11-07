import React, { useCallback, useMemo, useState } from 'react';
import {
    parseTheme,
    THEME_KEY,
    type Theme,
} from '@/platform/theme/theme-utils';
import { LocalConfigContext, type ScrollAction } from './local-config-context';
import { readStored, writeStored } from './stored';

const KEYS = {
    scrollAction: 'scroll_action',
    showDbViews: 'show_db_views',
    showCardinality: 'show_cardinality',
    showFieldAttributes: 'show_field_attributes',
    compactTables: 'compact_tables',
    showMinimap: 'show_minimap_on_canvas',
    outlineOverlaps: 'outline_overlapping_tables',
} as const;

const readBool = (key: string, fallback: boolean): boolean => {
    const value = readStored(key);
    return value === 'true' ? true : value === 'false' ? false : fallback;
};

/** A saved yes/no setting: the state starts from storage and writes back. */
const useStoredBool = (key: string, fallback: boolean) => {
    const [value, setValue] = useState(() => readBool(key, fallback));
    const set = useCallback(
        (next: boolean) => {
            writeStored(key, String(next));
            setValue(next);
        },
        [key]
    );
    return [value, set] as const;
};

/**
 * Owns the interface settings of the editor, the theme choice included. The
 * ThemeProvider below it reads the choice and applies it to the page.
 */
export const LocalConfigProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const [theme, setThemeState] = useState<Theme>(() =>
        parseTheme(readStored(THEME_KEY))
    );
    const setTheme = useCallback((next: Theme) => {
        writeStored(THEME_KEY, next);
        setThemeState(next);
    }, []);

    const [scrollAction, setScrollActionState] = useState<ScrollAction>(() =>
        readStored(KEYS.scrollAction) === 'zoom' ? 'zoom' : 'pan'
    );
    const setScrollAction = useCallback((next: ScrollAction) => {
        writeStored(KEYS.scrollAction, next);
        setScrollActionState(next);
    }, []);

    const [showDbViews, setShowDbViews] = useStoredBool(
        KEYS.showDbViews,
        false
    );
    const [showCardinality, setShowCardinality] = useStoredBool(
        KEYS.showCardinality,
        true
    );
    const [showFieldAttributes, setShowFieldAttributes] = useStoredBool(
        KEYS.showFieldAttributes,
        true
    );
    const [compactTables, setCompactTables] = useStoredBool(
        KEYS.compactTables,
        false
    );
    const [showMinimap, setShowMinimap] = useStoredBool(KEYS.showMinimap, true);
    const [outlineOverlaps, setOutlineOverlaps] = useStoredBool(
        KEYS.outlineOverlaps,
        false
    );

    const value = useMemo(
        () => ({
            theme,
            setTheme,
            scrollAction,
            setScrollAction,
            showDbViews,
            setShowDbViews,
            showCardinality,
            setShowCardinality,
            showFieldAttributes,
            setShowFieldAttributes,
            compactTables,
            setCompactTables,
            showMinimap,
            setShowMinimap,
            outlineOverlaps,
            setOutlineOverlaps,
        }),
        [
            theme,
            setTheme,
            scrollAction,
            setScrollAction,
            showDbViews,
            setShowDbViews,
            showCardinality,
            setShowCardinality,
            showFieldAttributes,
            setShowFieldAttributes,
            compactTables,
            setCompactTables,
            showMinimap,
            setShowMinimap,
            outlineOverlaps,
            setOutlineOverlaps,
        ]
    );

    return (
        <LocalConfigContext.Provider value={value}>
            {children}
        </LocalConfigContext.Provider>
    );
};
