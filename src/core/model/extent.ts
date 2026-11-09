/**
 * The smallest `value(item)`, or Infinity for no items. A loop, not
 * `Math.min(...items.map(value))`: spreading a big array overflows the stack.
 */
export function minBy<T>(
    items: readonly T[],
    value: (item: T) => number
): number {
    let least = Infinity;
    for (const item of items) {
        const v = value(item);
        if (v < least) least = v;
    }
    return least;
}

/** The largest `value(item)`, or -Infinity for no items. */
export function maxBy<T>(
    items: readonly T[],
    value: (item: T) => number
): number {
    let most = -Infinity;
    for (const item of items) {
        const v = value(item);
        if (v > most) most = v;
    }
    return most;
}
