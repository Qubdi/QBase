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

// Lets another part of the editor (Publish) send whatever the autosaver holds
// and wait for it, so there is never a second, competing save of the same base.
let flushNow: (() => Promise<void>) | null = null;

export const registerFlushNow = (fn: (() => Promise<void>) | null) => {
    flushNow = fn;
};

/** Sends any unsent edit through the autosaver and waits; never rejects. */
export const flushPendingSave = (): Promise<void> =>
    (flushNow?.() ?? Promise.resolve()).catch(() => undefined);

/** True while an edit has not reached the server: waiting, on its way, or refused. */
export const hasUnsavedChanges = (): boolean =>
    state.status === 'pending' ||
    state.status === 'saving' ||
    state.status === 'error';

// The running autosaver lets "Get latest" throw away what it has not sent, so
// the flush on page leave cannot push those edits back to the server.
let discard: (() => Promise<void> | void) | null = null;

export const registerSaveDiscard = (fn: (() => Promise<void> | void) | null) => {
    discard = fn;
};

/** Drops the unsent edits; settles once a save already on its way has. */
export const discardUnsavedChanges = (): Promise<void> =>
    Promise.resolve(discard?.()).catch(() => undefined);

// The edit lock may only be let go once the final save has settled: released
// first, the server would hand the lock to someone else (or give it back to
// the late save) while that save is still on its way.
let finalFlush: (() => Promise<void>) | null = null;
let finalSave: Promise<void> | null = null;

/** The running autosaver's "send everything now"; null when it stops. */
export const registerFinalFlush = (fn: (() => Promise<void>) | null) => {
    finalFlush = fn;
    // a new saver starts with no save on the way out
    if (fn) finalSave = null;
};

/** Remembers the last save sent while leaving the page or the diagram. */
export const trackFinalSave = (save: Promise<void>) => {
    finalSave = save;
};

/** Settles when the save sent on the way out has; at once when none is due. */
export const settleFinalSave = (): Promise<void> =>
    (finalSave ?? finalFlush?.() ?? Promise.resolve()).catch(() => undefined);

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
