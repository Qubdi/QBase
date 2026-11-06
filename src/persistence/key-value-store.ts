/** The part of localStorage / sessionStorage that is used here. */
export interface KeyValueStore {
    readonly length: number;
    key(index: number): string | null;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

/** Every key of the editor's own data starts with this (data-format 7). */
export const KEY_PREFIX = 'qbase.';

/** Reads a text value; a blocked store gives null instead of an error. */
export function readText(
    store: KeyValueStore | undefined,
    key: string
): string | null {
    try {
        return store ? store.getItem(key) : null;
    } catch {
        return null;
    }
}

/** Writes a text value; returns false when the store refuses (blocked, full). */
export function writeText(
    store: KeyValueStore | undefined,
    key: string,
    value: string
): boolean {
    try {
        if (!store) return false;
        store.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

/** Reads JSON; a missing, malformed or unreadable value gives `fallback`. */
export function readJson<T>(
    store: KeyValueStore | undefined,
    key: string,
    fallback: T
): T {
    const text = readText(store, key);
    if (text === null) return fallback;
    try {
        return JSON.parse(text) as T;
    } catch {
        return fallback;
    }
}

export function writeJson(
    store: KeyValueStore | undefined,
    key: string,
    value: unknown
): boolean {
    return writeText(store, key, JSON.stringify(value));
}

/** Removes every key that starts with `qbase.`; other keys (theme, view options) stay. */
export function clearOwnKeys(store: KeyValueStore | undefined): void {
    try {
        if (!store) return;
        const names: string[] = [];
        for (let i = 0; i < store.length; i++) {
            const name = store.key(i);
            if (name !== null && name.startsWith(KEY_PREFIX)) names.push(name);
        }
        for (const name of names) store.removeItem(name);
    } catch {
        // a blocked store has nothing to clear
    }
}
