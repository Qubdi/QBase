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

/** Who this browser's local copies belong to. */
export const LOCAL_OWNER_KEY = `${LOCAL_KEY_PREFIX}local-owner`;

/**
 * Records that the local copies belong to `userId`. If they were left by
 * someone else (a session that ended, or a sign-in without signing out first),
 * they are cleared first, so nobody finds another account's diagrams. Returns
 * true when it cleared; the caller then reloads to drop what the page still
 * holds in memory. Copies from before the owner was recorded are claimed, not
 * cleared: nothing says whose they are, and deleting could lose unsynced work.
 */
export async function claimLocalData(
    userId: string,
    deleteDatabase?: Parameters<typeof clearLocalUserData>[0]
): Promise<boolean> {
    let owner: string | null;
    try {
        owner = localStorage.getItem(LOCAL_OWNER_KEY);
    } catch {
        // storage unavailable: nothing is kept between visits either
        return false;
    }
    const foreign = owner !== null && owner !== userId;
    if (foreign) await clearLocalUserData(deleteDatabase);
    try {
        localStorage.setItem(LOCAL_OWNER_KEY, userId);
    } catch {
        // could not record it; the next sign-in will not know whose copies these are
    }
    return foreign;
}
