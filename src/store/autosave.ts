import type { StorageAdapter } from '@/persistence/storage-adapter';
import type { EditorStore } from './editor-store';

export const AUTOSAVE_DELAY_MS = 1000;

export interface AutosaveOptions {
    store: EditorStore;
    adapter: Pick<StorageAdapter, 'save'>;
    /** quiet time after the last change before saving (default 1000 ms) */
    delayMs?: number;
    /** called when a save fails; the dirty flag stays so the next change retries */
    onError?: (error: unknown) => void;
}

export interface Autosave {
    /** saves now if there is anything unsaved; resolves when the write ends */
    flush(): Promise<void>;
    /** stops watching; a pending save is dropped (call `flush` first to keep it) */
    dispose(): void;
}

/**
 * Saves the design to local storage a moment after it changes. A read-only
 * session never writes (spec C2). A failed save keeps the dirty flag, so the
 * person is not told the work is safe.
 */
export function startAutosave(options: AutosaveOptions): Autosave {
    const { store, adapter, onError } = options;
    const delay = options.delayMs ?? AUTOSAVE_DELAY_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running: Promise<void> | undefined;
    let disposed = false;

    const write = async (): Promise<void> => {
        const { design, session } = store.getState();
        if (session.readonly || !session.dirty) return;
        try {
            await adapter.save(design);
            // a change made while writing leaves the flag set
            if (store.getState().design === design)
                store.getState().markSaved();
        } catch (error) {
            onError?.(error);
        }
    };

    const run = (): Promise<void> => {
        // writes never overlap: each waits for the one before it
        running = (running ?? Promise.resolve()).then(write);
        return running;
    };

    const schedule = () => {
        if (disposed) return;
        clearTimeout(timer);
        timer = setTimeout(() => void run(), delay);
    };

    const unsubscribe = store.subscribe((state, previous) => {
        if (state.design !== previous.design && state.session.dirty) schedule();
        // a retry after a failed save: the person changed something else
        else if (state.session.dirty && !previous.session.dirty) schedule();
    });

    return {
        async flush() {
            clearTimeout(timer);
            await run();
        },
        dispose() {
            disposed = true;
            clearTimeout(timer);
            unsubscribe();
        },
    };
}
