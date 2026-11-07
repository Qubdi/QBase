/** SQL folds unquoted names, so names match ignoring case (original spelling is kept). */
export const sameName = (a: string, b: string): boolean =>
    a === b || a.toLowerCase() === b.toLowerCase();

interface Named {
    schema?: string;
    name: string;
}

export interface Resolved<T> {
    found: T | undefined;
    /** an unqualified name matched tables of several schemas */
    ambiguous: boolean;
}

/**
 * Finds a table by name: an exact spelling wins over a case-insensitive one,
 * the same schema wins over another, and an unqualified name may match any
 * schema (flagged `ambiguous` when more than one schema has it).
 */
export function resolveTable<T>(
    items: readonly T[],
    get: (item: T) => Named,
    want: Named
): Resolved<T> {
    const schemaOf = (i: T): string => get(i).schema ?? '';
    const exactName = (i: T): boolean => get(i).name === want.name;
    const foldName = (i: T): boolean => sameName(get(i).name, want.name);
    const ws = want.schema ?? '';
    const wsFold = ws.toLowerCase();
    const same = (i: T): boolean => schemaOf(i) === ws;
    const sameFold = (i: T): boolean => schemaOf(i).toLowerCase() === wsFold;
    const direct =
        items.find((i) => exactName(i) && same(i)) ??
        items.find((i) => foldName(i) && sameFold(i));
    if (direct) return { found: direct, ambiguous: false };
    if (want.schema !== undefined)
        return { found: undefined, ambiguous: false };
    const any = items.filter(foldName);
    const found = any.find(exactName) ?? any[0];
    const schemas = new Set(any.map((i) => schemaOf(i).toLowerCase()));
    return { found, ambiguous: schemas.size > 1 };
}
