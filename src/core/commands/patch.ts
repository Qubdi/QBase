import type { Patch } from './command';

/**
 * Applies a patch to a record. Returns the same object when nothing differs.
 * A key set to `undefined` is removed.
 */
export function applyPatch<T extends object>(record: T, patch: object): T {
    let next: Record<string, unknown> | undefined;
    for (const [key, value] of Object.entries(patch)) {
        const current = (record as Record<string, unknown>)[key];
        const had = Object.hasOwn(record, key);
        if (value === undefined ? !had : Object.is(current, value)) continue;
        next ??= { ...(record as Record<string, unknown>) };
        if (value === undefined) delete next[key];
        else next[key] = value;
    }
    return (next as T | undefined) ?? record;
}

/** The patch that puts `record` back to what it is now, for the keys of `patch`. */
export function inversePatch<T extends object>(
    record: T,
    patch: object
): Patch<T> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(patch)) {
        out[key] = Object.hasOwn(record, key)
            ? (record as Record<string, unknown>)[key]
            : undefined;
    }
    return out as Patch<T>;
}
