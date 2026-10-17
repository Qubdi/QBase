import { createContext } from 'react';
import { emptyFn } from '@/lib/utils';
import type { Theme } from '../theme-context/theme-context';

export type ScrollAction = 'pan' | 'zoom';

export interface LocalConfigContext {
    theme: Theme;
    setTheme: (theme: Theme) => void;

    scrollAction: ScrollAction;
    setScrollAction: (action: ScrollAction) => void;

    showDBViews: boolean;
    setShowDBViews: (showViews: boolean) => void;

    showCardinality: boolean;
    setShowCardinality: (showCardinality: boolean) => void;

    showFieldAttributes: boolean;
    setShowFieldAttributes: (showFieldAttributes: boolean) => void;

    // tables show names only (no types or nullability marks)
    compactTables: boolean;
    setCompactTables: (compactTables: boolean) => void;

    githubRepoOpened: boolean;
    setGithubRepoOpened: (githubRepoOpened: boolean) => void;

    showMiniMapOnCanvas: boolean;
    setShowMiniMapOnCanvas: (showMiniMapOnCanvas: boolean) => void;
}

export const LocalConfigContext = createContext<LocalConfigContext>({
    theme: 'system',
    setTheme: emptyFn,

    scrollAction: 'pan',
    setScrollAction: emptyFn,

    showDBViews: false,
    setShowDBViews: emptyFn,

    showCardinality: true,
    setShowCardinality: emptyFn,

    showFieldAttributes: true,
    setShowFieldAttributes: emptyFn,

    compactTables: false,
    setCompactTables: emptyFn,

    githubRepoOpened: false,
    setGithubRepoOpened: emptyFn,

    showMiniMapOnCanvas: false,
    setShowMiniMapOnCanvas: emptyFn,
});
