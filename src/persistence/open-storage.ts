import type { DexieOptions } from 'dexie';
import { openDexieStorage } from './dexie-adapter';
import type { OpenResult } from './dexie-adapter';
import { MemoryStorageAdapter } from './memory-adapter';
import type { StorageAdapter } from './storage-adapter';

export interface OpenedStorage {
    adapter: StorageAdapter;
    /** true when the browser refused IndexedDB and nothing will be kept */
    volatile: boolean;
    /** present when the real database opened */
    opened?: OpenResult;
    /** the reason, when volatile */
    error?: unknown;
}

/**
 * Opens the browser database, or an in-memory stand-in if the browser blocks
 * it (private windows, blocked site data), so the editor always opens with
 * defaults (DAT-018).
 */
export async function openStorage(
    options: Parameters<typeof openDexieStorage>[0] & DexieOptions = {}
): Promise<OpenedStorage> {
    try {
        const opened = await openDexieStorage(options);
        return { adapter: opened.adapter, volatile: false, opened };
    } catch (error) {
        return { adapter: new MemoryStorageAdapter(), volatile: true, error };
    }
}
