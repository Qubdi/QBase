import Dexie from 'dexie';

/** The IndexedDB database that holds this browser's copies of diagrams. */
export const LOCAL_DB_NAME = 'QubdiDB';

/** Every key the server integration keeps in localStorage and sessionStorage. */
export const LOCAL_KEY_PREFIX = 'qubdidb.';

const removePrefixed = (storage: Storage) => {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key?.startsWith(LOCAL_KEY_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
};

/**
 * Forgets what the signed-in person left in this browser: the local copies of
 * their diagrams and the id maps, versions and caches that point at them.
 * Signing out on a shared computer must not leave one account's diagrams for
 * the next. Interface settings (theme, view options) stay: they hold no data.
 */
export async function clearLocalUserData(
    deleteDatabase: (name: string) => Promise<unknown> = (name) =>
        Dexie.delete(name)
): Promise<void> {
    for (const storage of [localStorage, sessionStorage]) {
        try {
            removePrefixed(storage);
        } catch {
            // storage unavailable: nothing was kept there
        }
    }
    try {
        await deleteDatabase(LOCAL_DB_NAME);
    } catch {
        // could not delete (blocked or unsupported): the page reload that
        // follows still drops everything held in memory
    }
}
