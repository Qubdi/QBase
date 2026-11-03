import Dexie from 'dexie';

/** The IndexedDB database that holds this browser's copies of diagrams. */
export const LOCAL_DB_NAME = 'QBase';

/** The name that database had before the rename; its copies move to `LOCAL_DB_NAME`. */
export const LEGACY_LOCAL_DB_NAME = 'QubdiDB';

/** Every key the server integration keeps in localStorage and sessionStorage. */
export const LOCAL_KEY_PREFIX = 'qbase.';

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
    // with storage blocked, even reading the global throws
    for (const getStorage of [() => localStorage, () => sessionStorage]) {
        try {
            removePrefixed(getStorage());
        } catch {
            // storage unavailable: nothing was kept there
        }
    }
    for (const name of [LOCAL_DB_NAME, LEGACY_LOCAL_DB_NAME]) {
        try {
            await deleteDatabase(name);
        } catch {
            // could not delete (blocked or unsupported): the page reload that
            // follows still drops everything held in memory
        }
    }
}

/**
 * Moves the copies kept under the old database name into `target`, then
 * deletes the old database. Runs while `target` opens. `openLegacy` must
 * declare the same schema as `target`, so an old database still on an earlier
 * version is upgraded before it is read. The copy is one transaction: it lands
 * whole or not at all. If `target` already holds diagrams the old database is
 * left alone, never merged or deleted. Any failure leaves the old database in
 * place for the next load to retry.
 */
export async function adoptLegacyLocalData(
    target: Dexie,
    openLegacy: () => Dexie,
    exists: (name: string) => Promise<boolean> = (name) => Dexie.exists(name),
    deleteDatabase: (name: string) => Promise<unknown> = (name) =>
        Dexie.delete(name)
): Promise<void> {
    try {
        // Retried on every start for as long as the old database exists, so a
        // move that failed once is not given up on; rows the new database
        // already has (made since) are kept as they are.
        if (!(await exists(LEGACY_LOCAL_DB_NAME))) return;

        const names = new Set(target.tables.map((table) => table.name));
        const legacy = openLegacy();
        let rows: [string, unknown[]][];
        try {
            await legacy.open();
            rows = await Promise.all(
                legacy.tables
                    .filter((table) => names.has(table.name))
                    .map(
                        async (table) =>
                            [table.name, await table.toArray()] as [
                                string,
                                unknown[],
                            ]
                    )
            );
        } finally {
            legacy.close();
        }

        await target.transaction('rw', target.tables, async () => {
            for (const [name, items] of rows) {
                if (items.length === 0) continue;
                const table = target.table(name);
                const have = new Set(await table.toCollection().primaryKeys());
                const keyOf = (item: unknown) =>
                    table.schema.primKey.keyPath
                        ? table.schema.primKey.keyPath
                              .toString()
                              .split('.')
                              .reduce<unknown>(
                                  (v, k) => (v as Record<string, unknown>)?.[k],
                                  item
                              )
                        : undefined;
                const missing = items.filter(
                    (item) => !have.has(keyOf(item) as never)
                );
                if (missing.length > 0) await table.bulkPut(missing);
            }
        });
        await deleteDatabase(LEGACY_LOCAL_DB_NAME);
    } catch (error) {
        console.warn(
            'Could not move local diagrams to the new database',
            error
        );
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
