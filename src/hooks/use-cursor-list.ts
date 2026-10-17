import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/qubdi/api';

export interface CursorPage<T> {
    items: T[];
    /** where the next page starts; null when this was the last */
    nextCursor: string | null;
}

/**
 * State for a list that loads a page at a time and grows ("Load more"): the
 * server hands back a cursor instead of a page number, so rows that arrive
 * while someone reads cannot shift a page and repeat or skip a row.
 *
 * `filterKey` stands for whatever the caller filters by. When it changes the
 * list starts again from the first page; an answer to the old filter that
 * arrives late is thrown away, so it can never land in the new list.
 */
export function useCursorList<T extends { id: string | number }>(
    fetchPage: (cursor: string | null) => Promise<CursorPage<T>>,
    filterKey: string
) {
    const [items, setItems] = useState<T[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const fetchRef = useRef(fetchPage);
    fetchRef.current = fetchPage;
    // bumped on every restart, so a "load more" that was asked for before it
    // is ignored when it answers
    const generation = useRef(0);
    const cursorRef = useRef<string | null>(null);
    cursorRef.current = nextCursor;

    const shownFor = useRef(filterKey);

    useEffect(() => {
        // a "load more" still in flight belongs to the list being replaced
        generation.current++;
        // rows of the old filter must not sit under the new one; a reload of
        // the same filter keeps its rows until the fresh ones arrive
        if (shownFor.current !== filterKey) {
            shownFor.current = filterKey;
            setItems([]);
            setNextCursor(null);
        }
        setLoading(true);
        setLoadingMore(false);
        // the next run of this effect, or an unmount, makes this answer stale
        let stale = false;
        fetchRef
            .current(null)
            .then((page) => {
                if (stale) return;
                setItems(page.items);
                setNextCursor(page.nextCursor);
                setError(null);
                setLoading(false);
            })
            .catch((e: unknown) => {
                if (stale) return;
                setError(errorMessage(e));
                setLoading(false);
            });
        return () => {
            stale = true;
        };
    }, [filterKey, tick]);

    const loadMore = useCallback(() => {
        const cursor = cursorRef.current;
        if (cursor === null) return;
        const mine = generation.current;
        setLoadingMore(true);
        setError(null);
        fetchRef
            .current(cursor)
            .then((page) => {
                if (mine !== generation.current) return;
                setItems((current) => {
                    const known = new Set(current.map((i) => i.id));
                    return [
                        ...current,
                        ...page.items.filter((i) => !known.has(i.id)),
                    ];
                });
                setNextCursor(page.nextCursor);
                setLoadingMore(false);
            })
            .catch((e: unknown) => {
                if (mine !== generation.current) return;
                setError(errorMessage(e));
                setLoadingMore(false);
            });
    }, []);

    const reload = useCallback(() => setTick((t) => t + 1), []);

    return {
        items,
        hasMore: nextCursor !== null,
        /** true until the first page arrives (and again after a filter change) */
        loading,
        loadingMore,
        error,
        loadMore,
        reload,
    };
}
