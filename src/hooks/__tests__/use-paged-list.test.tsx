import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Page } from '@/lib/qubdi/paging';
import { usePagedList, type PagedFetch } from '../use-paged-list';

const pageOf = (
    items: string[],
    total: number,
    p: { page: number; limit: number }
): Page<string> => ({ items, total, page: p.page, limit: p.limit });

/** A fetcher over 25 fake rows that records every request. */
const makeFetcher = () => {
    const calls: PagedFetch[] = [];
    const rows = Array.from({ length: 25 }, (_, i) => `row-${i + 1}`);
    const fetcher = vi.fn(async (p: PagedFetch) => {
        calls.push(p);
        const matching = p.q ? rows.filter((r) => r.includes(p.q)) : rows;
        const start = (p.page - 1) * p.limit;
        return pageOf(
            matching.slice(start, start + p.limit),
            matching.length,
            p
        );
    });
    return { fetcher, calls };
};

const flush = () => act(async () => vi.advanceTimersByTimeAsync(0));
const wait = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));

describe('usePagedList', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('loads the first page on mount', async () => {
        const { fetcher } = makeFetcher();
        const { result } = renderHook(() =>
            usePagedList(fetcher, { limit: 10 })
        );
        expect(result.current.initialLoading).toBe(true);
        await flush();
        expect(result.current.initialLoading).toBe(false);
        expect(result.current.items).toHaveLength(10);
        expect(result.current.total).toBe(25);
        expect(result.current.pageCount).toBe(3);
        expect(result.current.page).toBe(1);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('fetches another page and keeps the old rows while it loads', async () => {
        const { fetcher } = makeFetcher();
        const { result } = renderHook(() =>
            usePagedList(fetcher, { limit: 10 })
        );
        await flush();
        const firstRows = result.current.items;
        act(() => result.current.setPage(2));
        // request is in flight: the previous rows are still there, no blank flash
        expect(result.current.loading).toBe(true);
        expect(result.current.initialLoading).toBe(false);
        expect(result.current.items).toBe(firstRows);
        await flush();
        expect(result.current.items[0]).toBe('row-11');
        expect(result.current.page).toBe(2);
    });

    it('waits for a pause in typing before searching', async () => {
        const { fetcher, calls } = makeFetcher();
        const { result } = renderHook(() =>
            usePagedList(fetcher, { limit: 10 })
        );
        await flush();
        act(() => result.current.setQuery('r'));
        act(() => result.current.setQuery('ro'));
        act(() => result.current.setQuery('row-2'));
        await wait(200);
        expect(fetcher).toHaveBeenCalledTimes(1); // still only the first page
        await wait(150);
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(calls.at(-1)).toEqual({
            page: 1,
            limit: 10,
            q: 'row-2',
            filter: '',
        });
        expect(result.current.total).toBe(7); // row-2 and row-20 to row-25
        expect(result.current.query).toBe('row-2');
    });

    it('goes back to page 1 when the search changes', async () => {
        const { fetcher, calls } = makeFetcher();
        const { result } = renderHook(() =>
            usePagedList(fetcher, { limit: 10 })
        );
        await flush();
        act(() => result.current.setPage(3));
        await flush();
        expect(result.current.page).toBe(3);
        act(() => result.current.setQuery('row-1'));
        await wait(350);
        expect(result.current.page).toBe(1);
        expect(calls.at(-1)).toMatchObject({ page: 1, q: 'row-1' });
    });

    it('does not reset the page when the search text is unchanged', async () => {
        const { fetcher } = makeFetcher();
        const { result } = renderHook(() =>
            usePagedList(fetcher, { limit: 10 })
        );
        await flush();
        act(() => result.current.setPage(2));
        await flush();
        act(() => result.current.setQuery('   ')); // blank is no search
        await wait(400);
        expect(result.current.page).toBe(2);
    });

    it('ignores a slow answer that arrives after a newer request', async () => {
        const resolvers: Array<() => void> = [];
        const fetcher = vi.fn(
            (p: PagedFetch) =>
                new Promise<Page<string>>((resolve) => {
                    resolvers.push(() =>
                        resolve(pageOf([`page-${p.page}`], 25, p))
                    );
                })
        );
        const { result } = renderHook(() =>
            usePagedList(fetcher, { limit: 10 })
        );
        await flush();
        resolvers[0](); // first page
        await flush();
        act(() => result.current.setPage(2)); // slow
        act(() => result.current.setPage(3)); // newer
        resolvers[2](); // the newer one answers first
        await flush();
        resolvers[1](); // the stale one answers late
        await flush();
        expect(result.current.items).toEqual(['page-3']);
        expect(result.current.page).toBe(3);
    });

    it('steps back to the last real page when the current one emptied', async () => {
        // 5 rows, 5 per page: asking for page 2 finds it empty
        const fetcher = vi.fn(async (p: PagedFetch) =>
            pageOf(p.page === 1 ? ['a', 'b', 'c', 'd', 'e'] : [], 5, p)
        );
        const { result } = renderHook(() =>
            usePagedList(fetcher, { limit: 5 })
        );
        await flush();
        act(() => result.current.setPage(2));
        await flush();
        expect(result.current.page).toBe(1);
        expect(result.current.items).toHaveLength(5);
    });

    it('passes the filter to the fetcher and restarts at page 1 when it changes', async () => {
        const { fetcher, calls } = makeFetcher();
        const { result, rerender } = renderHook(
            ({ filter }) => usePagedList(fetcher, { limit: 10, filter }),
            { initialProps: { filter: '' } }
        );
        await flush();
        act(() => result.current.setPage(3));
        await flush();
        expect(result.current.page).toBe(3);
        rerender({ filter: 'disabled' });
        await flush();
        expect(result.current.page).toBe(1);
        expect(calls.at(-1)).toEqual({
            page: 1,
            limit: 10,
            q: '',
            filter: 'disabled',
        });
    });

    it('does not fetch twice for the filter it started with', async () => {
        const { fetcher } = makeFetcher();
        renderHook(() =>
            usePagedList(fetcher, { limit: 10, filter: 'active' })
        );
        await flush();
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('fetches again on reload', async () => {
        const { fetcher } = makeFetcher();
        const { result } = renderHook(() =>
            usePagedList(fetcher, { limit: 10 })
        );
        await flush();
        act(() => result.current.reload());
        await flush();
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('reports a failure and recovers on the next success', async () => {
        let fail = true;
        const fetcher = vi.fn(async (p: PagedFetch) => {
            if (fail) throw new Error('offline');
            return pageOf(['ok'], 1, p);
        });
        const { result } = renderHook(() =>
            usePagedList(fetcher, { limit: 10 })
        );
        await flush();
        expect(result.current.error).toBeTruthy();
        expect(result.current.loading).toBe(false);
        fail = false;
        act(() => result.current.reload());
        await flush();
        expect(result.current.error).toBeNull();
        expect(result.current.items).toEqual(['ok']);
    });
});
