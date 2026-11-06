import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;
/**
 * How far down a list a request may skip. A deep OFFSET still reads every row
 * it skips, and nobody pages through ten thousand rows: they narrow the search.
 */
export const MAX_OFFSET = 10_000;

/** The paging fields alone, for a list endpoint that adds filters of its own. */
export const pagingFields = z.object({
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

/** Refuses a page whose offset passes MAX_OFFSET. Wrap the whole query schema. */
export const withOffsetCap = <T extends z.ZodType<{ page: number; limit: number }>>(
    schema: T
) =>
    schema.superRefine((value, ctx) => {
        if ((value.page - 1) * value.limit > MAX_OFFSET) {
            ctx.addIssue({
                code: 'custom',
                path: ['page'],
                message: `page is too far down the list: skip at most ${MAX_OFFSET} rows, or narrow the search`,
            });
        }
    });

/** `?page=2&limit=10&q=text` for any list endpoint. */
export const pagingQuery = withOffsetCap(pagingFields);

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
