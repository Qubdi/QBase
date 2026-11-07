import React from 'react';
import { render } from '@testing-library/react';
import { LocalConfigContext } from '@/context/local-config-context/local-config-context';
import type { LocalConfig } from '@/context/local-config-context/local-config-context';
import type { Design } from '@/core/model/design';
import { Toaster } from '@/platform/toast/toaster';
import { createEditorStore } from '@/store/editor-store';
import type { EditorStore, EditorStoreOptions } from '@/store/editor-store';
import { StoreContext } from '@/store/store-context';
import { PanelContextValue } from '@/platform/panel/panel-context';
import type { PanelContext } from '@/platform/panel/panel-context';

/** Renders a part of the side panel over a real store holding `design`. */
export function renderPanel(
    ui: React.ReactElement,
    design: Design,
    options: Partial<EditorStoreOptions> & {
        panel?: PanelContext;
        /** View > Database Views */
        showViews?: boolean;
    } = {}
): { store: EditorStore } & ReturnType<typeof render> {
    const { panel, showViews, ...storeOptions } = options;
    const noop = () => undefined;
    const config: LocalConfig = {
        theme: 'system',
        setTheme: noop,
        scrollAction: 'pan',
        setScrollAction: noop,
        showDbViews: showViews ?? false,
        setShowDbViews: noop,
        showCardinality: true,
        setShowCardinality: noop,
        showFieldAttributes: true,
        setShowFieldAttributes: noop,
        compactTables: false,
        setCompactTables: noop,
        showMinimap: true,
        setShowMinimap: noop,
    };
    const store = createEditorStore({ design, ...storeOptions });
    const result = render(
        <StoreContext.Provider value={store}>
            <LocalConfigContext.Provider value={config}>
                <PanelContextValue.Provider value={panel ?? {}}>
                    {ui}
                    <Toaster />
                </PanelContextValue.Provider>
            </LocalConfigContext.Provider>
        </StoreContext.Provider>
    );
    return { store, ...result };
}
