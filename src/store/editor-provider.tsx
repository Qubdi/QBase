import React, { useEffect, useRef, useState } from 'react';
import type { StorageAdapter } from '@/persistence/storage-adapter';
import { writePendingCopy } from '@/persistence/pending-copy';
import { startAutosave } from './autosave';
import { StoreContext } from './store-context';
import { createEditorStore } from './editor-store';
import type { EditorStoreOptions } from './editor-store';

export interface EditorStoreProviderProps extends EditorStoreOptions {
    /** where the design is saved; without it nothing is written */
    adapter?: Pick<StorageAdapter, 'save'> &
        Partial<Pick<StorageAdapter, 'wasRemoved'>>;
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
    const [store] = useState(() => createEditorStore(options));
    const errorRef = useRef(onSaveError);
    // runs before the autosave effect below, so a save error sees the latest callback
    useEffect(() => {
        errorRef.current = onSaveError;
    }, [onSaveError]);

    useEffect(() => {
        if (!adapter) return;
        const autosave = startAutosave({
            store,
            adapter,
            delayMs: autosaveDelayMs,
            onError: (error) => errorRef.current?.(error),
        });
        // The save waits for a quiet second, so a reload or a closed tab in that
        // second would lose the last edits: write them as the page is left,
        // and ask first while something is still unsaved.
        const flushOnLeave = () => {
            const { design, session } = store.getState();
            // The write to IndexedDB below may be cut off with the page, so the
            // design is also kept where a write finishes at once. It is read
            // back, and put into the store, the next time it is opened.
            if (
                session.dirty &&
                !session.readonly &&
                !adapter.wasRemoved?.(design.id)
            )
                writePendingCopy(design);
            void autosave.flush();
        };
        const flushWhenHidden = () => {
            if (document.visibilityState === 'hidden') flushOnLeave();
        };
        const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
            const { session } = store.getState();
            if (!session.dirty || session.readonly) return;
            event.preventDefault();
            // some browsers only ask when a return value is set
            event.returnValue = '';
        };
        window.addEventListener('pagehide', flushOnLeave);
        document.addEventListener('visibilitychange', flushWhenHidden);
        window.addEventListener('beforeunload', warnBeforeLeaving);
        return () => {
            window.removeEventListener('pagehide', flushOnLeave);
            document.removeEventListener('visibilitychange', flushWhenHidden);
            window.removeEventListener('beforeunload', warnBeforeLeaving);
            void autosave.flush().finally(() => autosave.dispose());
        };
    }, [store, adapter, autosaveDelayMs]);

    // the flag follows the prop: a lost edit lock turns it on, a regained one off
    useEffect(() => {
        const state = store.getState();
        const wanted = options.readonly ?? false;
        if (state.session.readonly !== wanted) state.setReadonly(wanted);
    }, [store, options.readonly]);

    return (
        <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
    );
};
