import { describe, expect, it, vi } from 'vitest';
import {
    fetchAllPages,
    listQuery,
    pageCountOf,
    pageRange,
    pageToFallBackTo,
    type Page,
} from '../paging';

describe('listQuery', () => {
    it('is empty when nothing is set', () => {
        expect(listQuery()).toBe('');
        expect(listQuery({})).toBe('');
        expect(listQuery({ page: 1, q: '   ' })).toBe('');
    });

    it('writes only what is set, trimming the search', () => {
        expect(listQuery({ page: 3, limit: 10, q: ' ann ' })).toBe(
            '?page=3&limit=10&q=ann'
        );
        expect(listQuery({ limit: 5 })).toBe('?limit=5');
    });

    it('adds extra filters, leaving out the empty ones', () => {
        expect(listQuery({ limit: 10 }, { status: 'disabled' })).toBe(
            '?limit=10&status=disabled'
        );
        expect(listQuery({}, { status: '' })).toBe('');
        expect(listQuery({}, { status: undefined })).toBe('');
    });

    it('encodes the search text', () => {
        expect(listQuery({ q: 'a&b c' })).toBe('?q=a%26b+c');
        expect(listQuery({ q: '50%' })).toBe('?q=50%25');
    });
});

describe('pageCountOf', () => {
    it('rounds up and never goes below one page', () => {
        expect(pageCountOf(0, 10)).toBe(1);
        expect(pageCountOf(10, 10)).toBe(1);
        expect(pageCountOf(11, 10)).toBe(2);
        expect(pageCountOf(43, 10)).toBe(5);
    });
});

describe('pageRange', () => {
    it('gives the rows shown on a page', () => {
        expect(pageRange(1, 10, 43)).toEqual({ from: 1, to: 10 });
        expect(pageRange(5, 10, 43)).toEqual({ from: 41, to: 43 });
    });

    it('is zero when there is nothing to show', () => {
        expect(pageRange(1, 10, 0)).toEqual({ from: 0, to: 0 });
    });

    it('never points past the total', () => {
        expect(pageRange(9, 10, 43)).toEqual({ from: 43, to: 43 });
    });
});

describe('pageToFallBackTo', () => {
    it('moves back to the last real page when the current one emptied', () => {
        expect(pageToFallBackTo(3, 10, { items: [], total: 20 })).toBe(2);
    });

    it('stays put when the page has rows, is the first, or the list is empty', () => {
        expect(pageToFallBackTo(2, 10, { items: [1], total: 11 })).toBeNull();
        expect(pageToFallBackTo(1, 10, { items: [], total: 5 })).toBeNull();
        expect(pageToFallBackTo(2, 10, { items: [], total: 0 })).toBeNull();
    });
});

describe('fetchAllPages', () => {
    const pageOf = (
        items: number[],
        total: number,
        page: number
    ): Page<number> => ({
        items,
        total,
        page,
        limit: 2,
    });

    it('reads page after page until the total is reached', async () => {
        const data = [[1, 2], [3, 4], [5]];
        const load = vi.fn(async (page: number) =>
            pageOf(data[page - 1], 5, page)
        );
        expect(await fetchAllPages(load)).toEqual([1, 2, 3, 4, 5]);
        expect(load.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    });

    it('stops after one request when everything fits on the first page', async () => {
        const load = vi.fn(async (page: number) => pageOf([1, 2], 2, page));
        expect(await fetchAllPages(load)).toEqual([1, 2]);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('stops at an empty page, even if the total says there is more', async () => {
        const load = vi.fn(async (page: number) =>
            pageOf(page === 1 ? [1, 2] : [], 9, page)
        );
        expect(await fetchAllPages(load)).toEqual([1, 2]);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('passes a failure on to the caller', async () => {
        await expect(
            fetchAllPages(async () => {
                throw new Error('offline');
            })
        ).rejects.toThrow('offline');
    });
});
