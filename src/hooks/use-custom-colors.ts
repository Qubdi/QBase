import { useCallback, useSyncExternalStore } from 'react';
import {
    addColor,
    CUSTOM_COLORS_KEY,
    parseSaved,
    removeColor,
    writeSavedColors,
} from '@/lib/custom-colors';

// One list shared by every color picker on the page, kept in localStorage so it
// survives reloads and is shared between tabs.
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const NONE: string[] = [];

let cachedRaw: string | null | undefined;
let cached: string[] = [];
// when the browser refuses to store, the colors still last for this session
let session: string[] | null = null;

const snapshot = (): string[] => {
    if (session) return session;
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(CUSTOM_COLORS_KEY);
    } catch {
        // unreadable storage: show no saved colors
    }
    if (raw !== cachedRaw) {
        cachedRaw = raw;
        cached = parseSaved(raw);
    }
    return cached;
};

const save = (next: string[]) => {
    session = writeSavedColors(next) ? null : next;
    emit();
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
        if (e.key === CUSTOM_COLORS_KEY || e.key === null) listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
    };
};

/** Test helper: forget what this module remembers between tests. */
export const resetCustomColorsForTests = () => {
    cachedRaw = undefined;
    cached = [];
    session = null;
    emit();
};

export function useCustomColors() {
    const colors = useSyncExternalStore(subscribe, snapshot, () => NONE);
    const add = useCallback(
        (color: string) => save(addColor(snapshot(), color)),
        []
    );
    const remove = useCallback(
        (color: string) => save(removeColor(snapshot(), color)),
        []
    );
    return { colors, add, remove };
}
