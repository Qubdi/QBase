import { useSyncExternalStore } from 'react';
import type { SaveStatus } from './autosave';

// A tiny shared store: the autosave runner writes it, the navbar chip reads it.
interface State {
    status: SaveStatus;
    retry: (() => void) | null;
}

let state: State = { status: 'idle', retry: null };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export const setSaveStatus = (
    status: SaveStatus,
    retry: (() => void) | null = state.retry
) => {
    state = { status, retry };
    emit();
};

export const resetSaveStatus = () => {
    state = { status: 'idle', retry: null };
    emit();
};

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
