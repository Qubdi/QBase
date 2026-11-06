import { createContext } from 'react';
import type { Theme } from '@/platform/theme/theme-utils';

export type ScrollAction = 'pan' | 'zoom';

export interface LocalConfig {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    scrollAction: ScrollAction;
    setScrollAction: (value: ScrollAction) => void;
    showDbViews: boolean;
    setShowDbViews: (value: boolean) => void;
    showCardinality: boolean;
    setShowCardinality: (value: boolean) => void;
    showFieldAttributes: boolean;
    setShowFieldAttributes: (value: boolean) => void;
    compactTables: boolean;
    setCompactTables: (value: boolean) => void;
    showMinimap: boolean;
    setShowMinimap: (value: boolean) => void;
}

const noop = () => undefined;

/** The defaults are what the page uses when nothing is saved or storage is refused. */
export const LocalConfigContext = createContext<LocalConfig>({
    theme: 'system',
    setTheme: noop,
    scrollAction: 'pan',
    setScrollAction: noop,
    showDbViews: false,
    setShowDbViews: noop,
    showCardinality: true,
    setShowCardinality: noop,
    showFieldAttributes: true,
    setShowFieldAttributes: noop,
    compactTables: false,
    setCompactTables: noop,
    showMinimap: true,
    setShowMinimap: noop,
});
