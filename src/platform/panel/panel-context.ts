import { createContext, useCallback, useContext } from 'react';
import { useEditorStoreApi } from '@/store/store-context';
import type { Id } from '@/core/model/id';

/** What the frame around the side panel tells it about the canvas. */
export interface PanelContext {
    /** the top-left corner of what the canvas shows, in canvas coordinates */
    viewportOrigin?: () => { x: number; y: number };
    /** called after the panel asked the canvas to show something (a phone closes its drawer) */
    onFocused?: () => void;
}

export const PanelContextValue = createContext<PanelContext>({});

/** Selects an object and asks the canvas to centre it (EDT-107, EDT-010). */
export function useFocus(): (id: Id) => void {
    const store = useEditorStoreApi();
    const { onFocused } = useContext(PanelContextValue);
    return useCallback(
        (id) => {
            const state = store.getState();
            state.select([id]);
            state.focusEntity(id);
            onFocused?.();
        },
        [store, onFocused]
    );
}
