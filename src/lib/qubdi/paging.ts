// Helpers for the paged lists (admin users, admin projects, the project list).

export interface Page<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
}

export interface ListParams {
    page?: number;
    limit?: number;
    q?: string;
}

/** `?page=2&limit=10&q=ann`, leaving out whatever is not set. `extra` adds more filters. */
export function listQuery(
    params?: ListParams,
    extra?: Record<string, string | undefined>
): string {
    const search = new URLSearchParams();
    if (params?.page && params.page > 1)
        search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    const q = params?.q?.trim();
    if (q) search.set('q', q);
    for (const [key, value] of Object.entries(extra ?? {})) {
        if (value) search.set(key, value);
    }
    const text = search.toString();
    return text ? `?${text}` : '';
}

/** Every item of a paged list: asks for page after page until the total is reached. */
export async function fetchAllPages<T>(
    load: (page: number) => Promise<Page<T>>
): Promise<T[]> {
    const all: T[] = [];
    for (let page = 1; ; page++) {
        const result = await load(page);
        all.push(...result.items);
        // an empty page ends it too, so a list that shrinks cannot loop forever
        if (result.items.length === 0 || all.length >= result.total) break;
    }
    return all;
}

export const pageCountOf = (total: number, limit: number): number =>
    Math.max(1, Math.ceil(total / Math.max(1, limit)));

/** The 1-based range shown on a page, e.g. 11 to 20 of 43. Zeroes when empty. */
export function pageRange(
    page: number,
    limit: number,
    total: number
): { from: number; to: number } {
    if (total === 0) return { from: 0, to: 0 };
    const from = (page - 1) * limit + 1;
    return { from: Math.min(from, total), to: Math.min(page * limit, total) };
}

/**
 * After a page loads: if it is empty although earlier pages have rows (the
 * last row of the last page was deleted), the page to move back to.
 */
export function pageToFallBackTo(
    page: number,
    limit: number,
    loaded: Pick<Page<unknown>, 'items' | 'total'>
): number | null {
    if (page > 1 && loaded.items.length === 0 && loaded.total > 0) {
        return pageCountOf(loaded.total, limit);
    }
    return null;
}
