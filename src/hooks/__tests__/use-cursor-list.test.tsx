import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCursorList, type CursorPage } from '../use-cursor-list';

interface Row {
    id: number;
}

const rows = (...ids: number[]): Row[] => ids.map((id) => ({ id }));

/** A promise the test settles by hand, to control the order of answers. */
const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe('useCursorList', () => {
    it('loads the first page on mount, without a cursor', async () => {
        const fetchPage = vi.fn(async (): Promise<CursorPage<Row>> => ({
            items: rows(3, 2, 1),
            nextCursor: null,
        }));
        const { result } = renderHook(() => useCursorList(fetchPage, 'all'));
        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(fetchPage).toHaveBeenCalledWith(null);
        expect(result.current.items).toEqual(rows(3, 2, 1));
        expect(result.current.hasMore).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('asks for the next page with the cursor and adds it below', async () => {
        const fetchPage = vi.fn(
            async (cursor: string | null): Promise<CursorPage<Row>> =>
                cursor === null
                    ? { items: rows(6, 5, 4), nextCursor: 'c1' }
                    : cursor === 'c1'
                      ? { items: rows(3, 2, 1), nextCursor: null }
                      : { items: [], nextCursor: null }
        );
        const { result } = renderHook(() => useCursorList(fetchPage, 'all'));
        await waitFor(() => expect(result.current.hasMore).toBe(true));

        act(() => result.current.loadMore());
        expect(result.current.loadingMore).toBe(true);
        await waitFor(() => expect(result.current.loadingMore).toBe(false));

        expect(fetchPage).toHaveBeenLastCalledWith('c1');
        expect(result.current.items.map((r) => r.id)).toEqual([
            6, 5, 4, 3, 2, 1,
        ]);
        expect(result.current.hasMore).toBe(false);

        // nothing left: asking again does not call the server
        act(() => result.current.loadMore());
        expect(fetchPage).toHaveBeenCalledTimes(2);
    });

    it('never shows a row twice when pages overlap', async () => {
        const fetchPage = vi.fn(
            async (cursor: string | null): Promise<CursorPage<Row>> =>
                cursor === null
                    ? { items: rows(4, 3), nextCursor: 'c1' }
                    : { items: rows(3, 2, 1), nextCursor: null }
        );
        const { result } = renderHook(() => useCursorList(fetchPage, 'all'));
        await waitFor(() => expect(result.current.hasMore).toBe(true));
        act(() => result.current.loadMore());
        await waitFor(() => expect(result.current.hasMore).toBe(false));
        expect(result.current.items.map((r) => r.id)).toEqual([4, 3, 2, 1]);
    });

    it('starts over with no old rows when the filter changes', async () => {
        const second = deferred<CursorPage<Row>>();
        const fetchPage = vi.fn((_cursor: string | null, filter: string) =>
            filter === 'a'
                ? Promise.resolve<CursorPage<Row>>({
                      items: rows(1, 2),
                      nextCursor: 'more-a',
                  })
                : second.promise
        );
        const { result, rerender } = renderHook(
            ({ filter }) =>
                useCursorList((cursor) => fetchPage(cursor, filter), filter),
            { initialProps: { filter: 'a' } }
        );
        await waitFor(() => expect(result.current.items).toHaveLength(2));
        expect(result.current.hasMore).toBe(true);

        rerender({ filter: 'b' });
        // rows of filter "a" must not sit under filter "b" while it loads
        await waitFor(() => expect(result.current.items).toEqual([]));
        expect(result.current.loading).toBe(true);
        expect(result.current.hasMore).toBe(false);
        expect(fetchPage).toHaveBeenLastCalledWith(null, 'b');

        await act(async () =>
            second.resolve({ items: rows(9), nextCursor: null })
        );
        expect(result.current.items).toEqual(rows(9));
        expect(result.current.loading).toBe(false);
    });

    it('drops a late answer to a filter that is no longer chosen', async () => {
        const answers = {
            a: deferred<CursorPage<Row>>(),
            b: deferred<CursorPage<Row>>(),
        };
        const { result, rerender } = renderHook(
            ({ filter }: { filter: 'a' | 'b' }) =>
                useCursorList<Row>(() => answers[filter].promise, filter),
            { initialProps: { filter: 'a' as 'a' | 'b' } }
        );
        rerender({ filter: 'b' });

        await act(async () =>
            answers.b.resolve({ items: rows(20), nextCursor: null })
        );
        // the slower answer for "a" arrives last and must not replace "b"
        await act(async () =>
            answers.a.resolve({ items: rows(10, 11), nextCursor: 'x' })
        );
        expect(result.current.items).toEqual(rows(20));
        expect(result.current.hasMore).toBe(false);
    });

    it('drops a next page that arrives after the filter changed', async () => {
        const slowMore = deferred<CursorPage<Row>>();
        const fetchPage = vi.fn(
            (
                cursor: string | null,
                filter: string
            ): Promise<CursorPage<Row>> =>
                filter === 'a' && cursor === 'c1'
                    ? slowMore.promise
                    : Promise.resolve({
                          items: filter === 'a' ? rows(2, 1) : rows(50),
                          nextCursor: filter === 'a' ? 'c1' : null,
                      })
        );
        const { result, rerender } = renderHook(
            ({ filter }) => useCursorList((c) => fetchPage(c, filter), filter),
            { initialProps: { filter: 'a' } }
        );
        await waitFor(() => expect(result.current.hasMore).toBe(true));
        act(() => result.current.loadMore());

        rerender({ filter: 'b' });
        await waitFor(() => expect(result.current.items).toEqual(rows(50)));
        await act(async () =>
            slowMore.resolve({ items: rows(99), nextCursor: null })
        );

        expect(result.current.items).toEqual(rows(50));
        expect(result.current.loadingMore).toBe(false);
    });

    it('keeps the rows while the same list reloads, then swaps in the fresh ones', async () => {
        const fresh = deferred<CursorPage<Row>>();
        let calls = 0;
        const fetchPage = vi.fn(() =>
            ++calls === 1
                ? Promise.resolve<CursorPage<Row>>({
                      items: rows(2, 1),
                      nextCursor: null,
                  })
                : fresh.promise
        );
        const { result } = renderHook(() => useCursorList(fetchPage, 'all'));
        await waitFor(() => expect(result.current.items).toHaveLength(2));

        act(() => result.current.reload());
        expect(result.current.loading).toBe(true);
        expect(result.current.items).toEqual(rows(2, 1)); // no blank flash

        await act(async () =>
            fresh.resolve({ items: rows(3, 2, 1), nextCursor: null })
        );
        expect(result.current.items).toEqual(rows(3, 2, 1));
        expect(result.current.loading).toBe(false);
    });

    it('reports a failed first page', async () => {
        const fetchPage = vi.fn(async () => {
            throw new TypeError('network');
        });
        const { result } = renderHook(() => useCursorList(fetchPage, 'all'));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toMatch(/reach/i);
        expect(result.current.items).toEqual([]);
    });

    it('keeps what is shown when "load more" fails, and lets it be retried', async () => {
        let failNext = true;
        const fetchPage = vi.fn(
            async (cursor: string | null): Promise<CursorPage<Row>> => {
                if (cursor === null) {
                    return { items: rows(2, 1), nextCursor: 'c1' };
                }
                if (failNext) {
                    failNext = false;
                    throw new TypeError('network');
                }
                return { items: rows(0), nextCursor: null };
            }
        );
        const { result } = renderHook(() => useCursorList(fetchPage, 'all'));
        await waitFor(() => expect(result.current.hasMore).toBe(true));

        act(() => result.current.loadMore());
        await waitFor(() => expect(result.current.error).not.toBeNull());
        expect(result.current.items).toEqual(rows(2, 1));
        expect(result.current.hasMore).toBe(true);
        expect(result.current.loadingMore).toBe(false);

        act(() => result.current.loadMore());
        await waitFor(() => expect(result.current.hasMore).toBe(false));
        expect(result.current.items.map((r) => r.id)).toEqual([2, 1, 0]);
        expect(result.current.error).toBeNull();
    });

    it('does not set state after it is unmounted', async () => {
        const late = deferred<CursorPage<Row>>();
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { unmount } = renderHook(() =>
            useCursorList<Row>(() => late.promise, 'all')
        );
        unmount();
        await act(async () =>
            late.resolve({ items: rows(1), nextCursor: null })
        );
        expect(errors).not.toHaveBeenCalled();
        errors.mockRestore();
    });
});
