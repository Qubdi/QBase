import { createContext, useContext } from 'react';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import type { EditorState, EditorStore } from './editor-store';

export const StoreContext = createContext<EditorStore | null>(null);

/** The store of the open editor; throws outside a provider. */
export function useEditorStoreApi(): EditorStore {
    const store = useContext(StoreContext);
    if (!store)
        throw new Error(
            'No editor store: wrap the editor in EditorStoreProvider'
        );
    return store;
}

/** The store of the open editor, or null outside one (QBase parts that also run elsewhere). */
export function useOptionalEditorStoreApi(): EditorStore | null {
    return useContext(StoreContext);
}

/** Subscribes to one narrow piece of the state. */
export function useEditorStore<T>(
    selector: (state: EditorState) => T,
    equals: (a: T, b: T) => boolean = Object.is
): T {
    return useStoreWithEqualityFn(useEditorStoreApi(), selector, equals);
}
