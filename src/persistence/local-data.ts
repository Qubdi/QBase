import {
    DATABASE_NAME,
    PREVIOUS_DATABASE_NAME,
    deleteDatabase,
} from './database';
import { clearOwnKeys, readText, writeText } from './key-value-store';
import type { KeyValueStore } from './key-value-store';
import type { DexieOptions } from 'dexie';

export const OWNER_KEY = 'qbase.local-owner';

export interface LocalStores {
    local?: KeyValueStore;
    session?: KeyValueStore;
    dexie?: DexieOptions;
}

/**
 * Signing out (DAT-015): both databases go, and every `qbase.` key of both
 * browser stores; keys without the prefix (theme, view options) stay.
 */
export async function clearLocalData(stores: LocalStores): Promise<void> {
    clearOwnKeys(stores.local);
    clearOwnKeys(stores.session);
    for (const name of [DATABASE_NAME, PREVIOUS_DATABASE_NAME]) {
        try {
            await deleteDatabase(name, stores.dexie);
        } catch {
            // nothing more to do for a database that cannot be deleted
        }
    }
}

export type OwnershipOutcome = 'same' | 'claimed' | 'cleared';

/**
 * Signing in (DAT-016, DAT-017): if the copies belong to another person they
 * are cleared first (the caller then reloads); if nobody is recorded they are
 * claimed for this person without clearing, as they may hold unsynced work.
 */
export async function adoptUser(
    userId: string,
    stores: LocalStores
): Promise<OwnershipOutcome> {
    const owner = readText(stores.local, OWNER_KEY);
    if (owner === userId) return 'same';
    if (owner === null || owner === '') {
        writeText(stores.local, OWNER_KEY, userId);
        return 'claimed';
    }
    await clearLocalData(stores);
    writeText(stores.local, OWNER_KEY, userId);
    return 'cleared';
}
