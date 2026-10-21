import React, { useEffect } from 'react';
import type { ScrollAction } from './local-config-context';
import { LocalConfigContext } from './local-config-context';
import type { Theme } from '../theme-context/theme-context';
import { readStored, writeStored } from './stored';

const themeKey = 'theme';
const scrollActionKey = 'scroll_action';
const showCardinalityKey = 'show_cardinality';
const showFieldAttributesKey = 'show_field_attributes';
const compactTablesKey = 'compact_tables';
const showMiniMapOnCanvasKey = 'show_minimap_on_canvas';
const showDBViewsKey = 'show_db_views';

export const LocalConfigProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const [theme, setTheme] = React.useState<Theme>(
        (readStored(themeKey) as Theme) || 'system'
    );

    const [scrollAction, setScrollAction] = React.useState<ScrollAction>(
        (readStored(scrollActionKey) as ScrollAction) || 'pan'
    );

    const [showDBViews, setShowDBViews] = React.useState<boolean>(
        (readStored(showDBViewsKey) || 'false') === 'true'
    );

    const [showCardinality, setShowCardinality] = React.useState<boolean>(
        (readStored(showCardinalityKey) || 'true') === 'true'
    );

    const [showFieldAttributes, setShowFieldAttributes] =
        React.useState<boolean>(
            (readStored(showFieldAttributesKey) || 'true') === 'true'
        );

    const [compactTables, setCompactTables] = React.useState<boolean>(
        (readStored(compactTablesKey) || 'false') === 'true'
    );

    const [showMiniMapOnCanvas, setShowMiniMapOnCanvas] =
        React.useState<boolean>(
            (readStored(showMiniMapOnCanvasKey) || 'true') === 'true'
        );

    useEffect(() => {
        writeStored(compactTablesKey, compactTables.toString());
    }, [compactTables]);

    useEffect(() => {
        writeStored(themeKey, theme);
    }, [theme]);

    useEffect(() => {
        writeStored(scrollActionKey, scrollAction);
    }, [scrollAction]);

    useEffect(() => {
        writeStored(showDBViewsKey, showDBViews.toString());
    }, [showDBViews]);

    useEffect(() => {
        writeStored(showCardinalityKey, showCardinality.toString());
    }, [showCardinality]);

    useEffect(() => {
        writeStored(showMiniMapOnCanvasKey, showMiniMapOnCanvas.toString());
    }, [showMiniMapOnCanvas]);

    return (
        <LocalConfigContext.Provider
            value={{
                theme,
                setTheme,
                scrollAction,
                setScrollAction,
                showDBViews,
                setShowDBViews,
                showCardinality,
                setShowCardinality,
                showFieldAttributes,
                setShowFieldAttributes,
                compactTables,
                setCompactTables,
                showMiniMapOnCanvas,
                setShowMiniMapOnCanvas,
            }}
        >
            {children}
        </LocalConfigContext.Provider>
    );
};
