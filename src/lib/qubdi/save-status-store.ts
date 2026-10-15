import { useSyncExternalStore } from 'react';
import type { SaveStatus } from './autosave';

// A tiny shared store: the autosave runner writes it, the navbar chip reads it.
interface State {
    status: SaveStatus;
    retry: (() => void) | null;
    /**
     * Set when the last save was refused because someone else saved newer
     * content: saves on top of their version, replacing it.
     */
    overwrite: (() => void) | null;
}

let state: State = { status: 'idle', retry: null, overwrite: null };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export const setSaveStatus = (
    status: SaveStatus,
    retry: (() => void) | null = state.retry,
    overwrite: (() => void) | null = null
) => {
    state = { status, retry, overwrite };
    emit();
};

export const resetSaveStatus = () => {
    state = { status: 'idle', retry: null, overwrite: null };
    emit();
};

// The running autosaver lets "Get latest" throw away what it has not sent, so
// the flush on page leave cannot push those edits back to the server.
let discard: (() => void) | null = null;

export const registerSaveDiscard = (fn: (() => void) | null) => {
    discard = fn;
};

export const discardUnsavedChanges = () => discard?.();

const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
};

export const useSaveStatus = (): State =>
    useSyncExternalStore(
        subscribe,
        () => state,
        () => state
    );
