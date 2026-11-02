import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/** `?page=2&limit=10&q=text` for any list endpoint. */
export const pagingQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_PAGE_SIZE)
        .default(DEFAULT_PAGE_SIZE),
    q: z
        .string()
        .trim()
        .max(100)
        .optional()
        .transform((v) => (v ? v : undefined)),
});

export type Paging = z.infer<typeof pagingQuery>;

export interface Page<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
}

export const offsetOf = ({ page, limit }: Pick<Paging, 'page' | 'limit'>) =>
    (page - 1) * limit;

export const pageOf = <T>(
    items: T[],
    total: number,
    { page, limit }: Pick<Paging, 'page' | 'limit'>
): Page<T> => ({ items, total, page, limit });

/**
 * A case-insensitive "contains" pattern for ILIKE, with the wildcard
 * characters in the search text escaped so "50%" means exactly that.
 */
export const containsPattern = (text: string): string =>
    `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
