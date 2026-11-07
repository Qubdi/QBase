import React from 'react';
import { render } from '@testing-library/react';
import type { Design } from '@/core/model/design';
import { createEditorStore } from '@/store/editor-store';
import type { EditorStore, EditorStoreOptions } from '@/store/editor-store';
import { StoreContext } from '@/store/store-context';
import { PanelContextValue } from '@/platform/panel/panel-context';
import type { PanelContext } from '@/platform/panel/panel-context';

/** Renders a part of the side panel over a real store holding `design`. */
export function renderPanel(
    ui: React.ReactElement,
    design: Design,
    options: Partial<EditorStoreOptions> & { panel?: PanelContext } = {}
): { store: EditorStore } & ReturnType<typeof render> {
    const { panel, ...storeOptions } = options;
    const store = createEditorStore({ design, ...storeOptions });
    const result = render(
        <StoreContext.Provider value={store}>
            <PanelContextValue.Provider value={panel ?? {}}>
                {ui}
            </PanelContextValue.Provider>
        </StoreContext.Provider>
    );
    return { store, ...result };
}
