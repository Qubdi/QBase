import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { errorMessage } from '@/lib/qubdi/api';
import { pageCountOf, pageToFallBackTo, type Page } from '@/lib/qubdi/paging';

export interface PagedFetch {
    page: number;
    limit: number;
    q: string;
    /** an extra criterion such as a status filter; '' means none */
    filter: string;
}

/**
 * State for a server-paged, searchable list. Typing in the search waits for a
 * pause before asking the server, a new search starts again at page 1, the
 * previous rows stay visible while the next page loads, and a page that
 * emptied (its last row was deleted) steps back to the last real page.
 *
 * With `refreshMs` the page on screen is also fetched again in the background
 * at that interval, and when a hidden tab is shown again. A refresh is silent:
 * `loading` stays false, the rows are swapped in place, and a failed one is
 * ignored (the next one tries again).
 */
export function usePagedList<T>(
    fetchPage: (params: PagedFetch) => Promise<Page<T>>,
    options: {
        limit: number;
        debounceMs?: number;
        filter?: string;
        /** background refresh interval in milliseconds; none when omitted */
        refreshMs?: number;
    }
) {
    const { limit, debounceMs = 300, filter = '', refreshMs } = options;
    const [query, setQuery] = useState('');
    const [committed, setCommitted] = useState({ q: '', page: 1, filter });
    const [data, setData] = useState<Page<T> | null>(null);
    // the request (committed search and reload count) whose page last answered
    const [settled, setSettled] = useState<{
        committed: typeof committed;
        tick: number;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const loading = !(
        settled !== null &&
        settled.committed === committed &&
        settled.tick === tick
    );
    const fetchRef = useRef(fetchPage);
    useLayoutEffect(() => {
        fetchRef.current = fetchPage;
    });

    // commit the search text after a pause; a different search restarts at page 1
    useEffect(() => {
        const timer = setTimeout(() => {
            const q = query.trim();
            setCommitted((c) => (c.q === q ? c : { ...c, q, page: 1 }));
        }, debounceMs);
        return () => clearTimeout(timer);
    }, [query, debounceMs]);

    // a different filter shows a different list: start again at page 1
    if (committed.filter !== filter) {
        setCommitted({ ...committed, filter, page: 1 });
    }

    useEffect(() => {
        let stale = false;
        fetchRef
            .current({
                page: committed.page,
                limit,
                q: committed.q,
                filter: committed.filter,
            })
            .then((loaded) => {
                if (stale) return;
                const back = pageToFallBackTo(committed.page, limit, loaded);
                if (back !== null) {
                    setCommitted((c) => ({ ...c, page: back }));
                    return;
                }
                setData(loaded);
                setError(null);
                setSettled({ committed, tick });
            })
            .catch((e: unknown) => {
                if (stale) return;
                setError(errorMessage(e));
                setSettled({ committed, tick });
            });
        return () => {
            stale = true;
        };
    }, [committed, limit, tick]);

    // the background refresh of the page on screen; a different page, search or
    // reload starts it over, and an answer to the old view is thrown away
    useEffect(() => {
        if (!refreshMs) return;
        let alive = true;
        let running = false;
        const refresh = () => {
            if (document.hidden || running) return;
            running = true;
            fetchRef
                .current({
                    page: committed.page,
                    limit,
                    q: committed.q,
                    filter: committed.filter,
                })
                .then((loaded) => {
                    if (!alive) return;
                    if (
                        pageToFallBackTo(committed.page, limit, loaded) !== null
                    ) {
                        // the page emptied: let the normal load step back
                        setTick((t) => t + 1);
                        return;
                    }
                    setData(loaded);
                })
                .catch(() => undefined)
                .finally(() => {
                    running = false;
                });
        };
        const onVisible = () => {
            if (!document.hidden) refresh();
        };
        const timer = setInterval(refresh, refreshMs);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            alive = false;
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [refreshMs, committed, limit, tick]);

    const setPage = useCallback(
        (page: number) => setCommitted((c) => ({ ...c, page })),
        []
    );
    const reload = useCallback(() => setTick((t) => t + 1), []);

    const total = data?.total ?? 0;
    return {
        items: data?.items ?? [],
        total,
        page: committed.page,
        pageCount: pageCountOf(total, limit),
        limit,
        /** true until the first page arrives */
        initialLoading: data === null && loading,
        loading,
        error,
        query,
        setQuery,
        setPage,
        reload,
    };
}
