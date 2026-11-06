import type { Id } from './id';

/**
 * Records held by id, with an explicit order. Both parts are replaced, never
 * changed in place, so unchanged parts keep their identity between designs.
 */
export interface Collection<T> {
    readonly byId: Readonly<Record<Id, T>>;
    readonly order: readonly Id[];
}

export function emptyCollection<T>(): Collection<T> {
    return { byId: {}, order: [] };
}

export function collectionOf<T extends { id: Id }>(
    items: readonly T[]
): Collection<T> {
    const byId: Record<Id, T> = {};
    for (const item of items) byId[item.id] = item;
    return { byId, order: items.map((item) => item.id) };
}

export function listOf<T>(collection: Collection<T>): T[] {
    return collection.order.map((id) => collection.byId[id]);
}

export function hasItem<T>(collection: Collection<T>, id: Id): boolean {
    return Object.prototype.hasOwnProperty.call(collection.byId, id);
}

export function getItem<T>(collection: Collection<T>, id: Id): T | undefined {
    return hasItem(collection, id) ? collection.byId[id] : undefined;
}

/** Adds `item` at `index` (default: the end). The id must be new. */
export function insertItem<T extends { id: Id }>(
    collection: Collection<T>,
    item: T,
    index?: number
): Collection<T> {
    const order = collection.order.slice();
    const at =
        index === undefined
            ? order.length
            : Math.max(0, Math.min(index, order.length));
    order.splice(at, 0, item.id);
    return { byId: { ...collection.byId, [item.id]: item }, order };
}

export function removeItem<T>(
    collection: Collection<T>,
    id: Id
): Collection<T> {
    if (!hasItem(collection, id)) return collection;
    const byId = { ...collection.byId };
    delete byId[id];
    return { byId, order: collection.order.filter((other) => other !== id) };
}

export function replaceItem<T extends { id: Id }>(
    collection: Collection<T>,
    item: T
): Collection<T> {
    return { ...collection, byId: { ...collection.byId, [item.id]: item } };
}

export function indexOfItem<T>(collection: Collection<T>, id: Id): number {
    return collection.order.indexOf(id);
}

/** Same members in a new order; `ids` must be a permutation of the current ids. */
export function reorderItems<T>(
    collection: Collection<T>,
    ids: readonly Id[]
): Collection<T> {
    return { byId: collection.byId, order: ids.slice() };
}

export function isPermutation(
    current: readonly Id[],
    next: readonly Id[]
): boolean {
    if (current.length !== next.length) return false;
    const seen = new Set(current);
    if (seen.size !== current.length) return false;
    for (const id of next) {
        if (!seen.delete(id)) return false;
    }
    return seen.size === 0;
}
