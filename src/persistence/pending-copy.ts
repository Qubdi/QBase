import type { Design } from '../core/model/design';
import { parse } from '../core/wire/parse';
import { serialise } from '../core/wire/serialise';
import type { LoadedDesign, StorageAdapter } from './storage-adapter';

/**
 * A copy of the open design kept in `localStorage` as the page is left.
 *
 * The autosave waits for a quiet second and writes to IndexedDB, which cannot
 * be relied on to finish once the page is already going away (a reload or a
 * closed tab): the write is cut off. `localStorage` is written synchronously,
 * so what was changed in that last second is still there, and the next time
 * the design is opened it is read back and put into the real store.
 *
 * It is a best effort: a design too large for the browser's quota is skipped,
 * and the "unsaved changes" prompt remains the guard for that case.
 */
const KEY_PREFIX = 'qbase:pending-copy:';

const keyOf = (id: string): string => `${KEY_PREFIX}${id}`;

function storage(): Storage | undefined {
    try {
        return globalThis.localStorage;
    } catch {
        // blocked cookies or storage: there is no place to keep it
        return undefined;
    }
}

/** Keeps `design` as it is now; true when it was written. */
export function writePendingCopy(design: Design): boolean {
    const store = storage();
    if (!store) return false;
    try {
        store.setItem(
            keyOf(design.id),
            JSON.stringify({ at: design.updatedAt, doc: serialise(design) })
        );
        return true;
    } catch {
        // over the quota, or storage refused: skip it
        return false;
    }
}

/**
 * The copy kept for this design, when there is one. It is not removed: remove
 * it (`clearPendingCopy`) once it has been written to the real store.
 */
export function readPendingCopy(id: string): LoadedDesign | undefined {
    const store = storage();
    if (!store) return undefined;
    try {
        const raw = store.getItem(keyOf(id));
        if (!raw) return undefined;
        const { doc } = JSON.parse(raw) as { doc?: unknown };
        if (!doc || typeof doc !== 'object') return undefined;
        return parse(doc);
    } catch {
        return undefined;
    }
}

export function clearPendingCopy(id: string): void {
    try {
        storage()?.removeItem(keyOf(id));
    } catch {
        // nothing to do
    }
}

/**
 * What to open for a design that was just loaded from storage: the copy kept as
 * the page was left when it is newer, after writing it to the real store, or
 * the stored one. A copy that is not newer was only left over (the write did
 * finish) and is dropped.
 */
export async function restorePendingCopy(
    /** where to write it; without one the copy is only shown, and kept */
    adapter: Pick<StorageAdapter, 'save'> | undefined,
    id: string,
    stored: LoadedDesign
): Promise<LoadedDesign> {
    const pending = readPendingCopy(id);
    if (!pending) return stored;
    if (pending.design.updatedAt <= stored.design.updatedAt) {
        if (!adapter) return stored;
        clearPendingCopy(id);
        return stored;
    }
    if (!adapter) return pending;
    try {
        await adapter.save(pending.design, { update: true });
        clearPendingCopy(id);
    } catch {
        // not written: keep the copy for the next time, and open it all the same
    }
    return pending;
}
