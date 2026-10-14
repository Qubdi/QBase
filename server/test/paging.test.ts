import { describe, expect, it } from 'vitest';
import {
    containsPattern,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    offsetOf,
    pageOf,
    pagingQuery,
} from '../src/lib/paging.js';

describe('pagingQuery', () => {
    it('defaults to the first page', () => {
        expect(pagingQuery.parse({})).toEqual({
            page: 1,
            limit: DEFAULT_PAGE_SIZE,
            q: undefined,
        });
    });

    it('reads numbers from the query string and trims the search text', () => {
        expect(pagingQuery.parse({ page: '3', limit: '10', q: '  ann ' })).toEqual({
            page: 3,
            limit: 10,
            q: 'ann',
        });
    });

    it('treats a blank search as no search', () => {
        expect(pagingQuery.parse({ q: '   ' }).q).toBeUndefined();
    });

    it('rejects out-of-range values', () => {
        expect(pagingQuery.safeParse({ page: '0' }).success).toBe(false);
        expect(pagingQuery.safeParse({ limit: '0' }).success).toBe(false);
        expect(pagingQuery.safeParse({ limit: String(MAX_PAGE_SIZE + 1) }).success).toBe(false);
        expect(pagingQuery.safeParse({ page: '1.5' }).success).toBe(false);
        expect(pagingQuery.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
    });
});

describe('offsetOf / pageOf', () => {
    it('skips the earlier pages', () => {
        expect(offsetOf({ page: 1, limit: 10 })).toBe(0);
        expect(offsetOf({ page: 3, limit: 10 })).toBe(20);
    });

    it('wraps the rows with the total and the paging used', () => {
        expect(pageOf(['a'], 41, { page: 2, limit: 10 })).toEqual({
            items: ['a'],
            total: 41,
            page: 2,
            limit: 10,
        });
    });
});

describe('containsPattern', () => {
    it('matches anywhere in the text', () => {
        expect(containsPattern('ann')).toBe('%ann%');
    });

    it('escapes LIKE wildcards so they are searched literally', () => {
        expect(containsPattern('50%')).toBe('%50\\%%');
        expect(containsPattern('a_b')).toBe('%a\\_b%');
        expect(containsPattern('back\\slash')).toBe('%back\\\\slash%');
    });
});
