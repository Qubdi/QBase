import React, { useEffect, useRef } from 'react';
import type { StorageAdapter } from '@/persistence/storage-adapter';
import { startAutosave } from './autosave';
import { StoreContext } from './store-context';
import { createEditorStore } from './editor-store';
import type { EditorStore, EditorStoreOptions } from './editor-store';

export interface EditorStoreProviderProps extends EditorStoreOptions {
    /** where the design is saved; without it nothing is written */
    adapter?: Pick<StorageAdapter, 'save'>;
    onSaveError?: (error: unknown) => void;
    autosaveDelayMs?: number;
    children?: React.ReactNode;
}

/**
 * Creates the store for one open editor and saves the design as it changes.
 * The store is made once; to open another design, give the provider a new `key`.
 */
export const EditorStoreProvider: React.FC<EditorStoreProviderProps> = ({
    adapter,
    onSaveError,
    autosaveDelayMs,
    children,
    ...options
}) => {
    const ref = useRef<EditorStore | null>(null);
    ref.current ??= createEditorStore(options);
    const store = ref.current;
    const errorRef = useRef(onSaveError);
    errorRef.current = onSaveError;

    useEffect(() => {
        if (!adapter) return;
        const autosave = startAutosave({
            store,
            adapter,
            delayMs: autosaveDelayMs,
            onError: (error) => errorRef.current?.(error),
        });
        return () => {
            void autosave.flush().finally(() => autosave.dispose());
        };
    }, [store, adapter, autosaveDelayMs]);

    // a saved design is edited by the person who just opened it
    useEffect(() => {
        const state = store.getState();
        if (
            options.readonly !== undefined &&
            state.session.readonly !== options.readonly
        )
            state.setReadonly(options.readonly);
    }, [store, options.readonly]);

    return (
        <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
    );
};
