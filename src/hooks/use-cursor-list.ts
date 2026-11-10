import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { errorMessage } from '@/lib/qubdi/api';

export interface CursorPage<T> {
    items: T[];
    /** where the next page starts; null when this was the last */
    nextCursor: string | null;
}

const NO_ITEMS: never[] = [];

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
    // the rows belong to the filter they were fetched for; under another filter
    // they are not shown, so rows of the old filter never sit under the new one
    // while a reload of the same filter keeps its rows until the fresh ones arrive
    const [loaded, setLoaded] = useState<{
        filterKey: string;
        items: T[];
        nextCursor: string | null;
    } | null>(null);
    // the request (filter and reload count) whose first page last answered
    const [settledKey, setSettledKey] = useState<string | null>(null);
    // the request a "load more" is running for; a restart makes it irrelevant
    const [moreFor, setMoreFor] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const requestKey = `${tick}:${filterKey}`;
    const current = loaded && loaded.filterKey === filterKey ? loaded : null;
    const items = current?.items ?? NO_ITEMS;
    const nextCursor = current?.nextCursor ?? null;
    const loading = settledKey !== requestKey;
    const loadingMore = moreFor === requestKey;

    const fetchRef = useRef(fetchPage);
    const cursorRef = useRef<string | null>(null);
    const requestRef = useRef(requestKey);
    useLayoutEffect(() => {
        fetchRef.current = fetchPage;
        cursorRef.current = nextCursor;
        requestRef.current = requestKey;
    });
    // bumped on every restart, so a "load more" that was asked for before it
    // is ignored when it answers
    const generation = useRef(0);

    useEffect(() => {
        // a "load more" still in flight belongs to the list being replaced
        generation.current++;
        // the next run of this effect, or an unmount, makes this answer stale
        let stale = false;
        fetchRef
            .current(null)
            .then((page) => {
                if (stale) return;
                setLoaded({
                    filterKey,
                    items: page.items,
                    nextCursor: page.nextCursor,
                });
                setError(null);
                setSettledKey(`${tick}:${filterKey}`);
            })
            .catch((e: unknown) => {
                if (stale) return;
                setError(errorMessage(e));
                setSettledKey(`${tick}:${filterKey}`);
            });
        return () => {
            stale = true;
        };
    }, [filterKey, tick]);

    const loadMore = useCallback(() => {
        const cursor = cursorRef.current;
        if (cursor === null) return;
        const mine = generation.current;
        setMoreFor(requestRef.current);
        setError(null);
        fetchRef
            .current(cursor)
            .then((page) => {
                if (mine !== generation.current) return;
                setLoaded((was) => {
                    if (!was) return was;
                    const known = new Set(was.items.map((i) => i.id));
                    return {
                        ...was,
                        items: [
                            ...was.items,
                            ...page.items.filter((i) => !known.has(i.id)),
                        ],
                        nextCursor: page.nextCursor,
                    };
                });
                setMoreFor(null);
            })
            .catch((e: unknown) => {
                if (mine !== generation.current) return;
                setError(errorMessage(e));
                setMoreFor(null);
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
