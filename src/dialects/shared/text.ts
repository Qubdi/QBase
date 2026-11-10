/** Small text helpers shared by the SQL writers. */

/** Locale comparison used wherever the spec says "sorted as text". */
export function byText(a: string, b: string): number {
    return a.localeCompare(b);
}

/** Wraps a name in quotes, doubling the closing quote inside it. */
export function wrapName(open: string, close: string, name: string): string {
    return open + name.split(close).join(close + close) + close;
}

export const quoteDouble = (name: string): string => wrapName('"', '"', name);
export const quoteBacktick = (name: string): string => wrapName('`', '`', name);
export const quoteBracket = (name: string): string => wrapName('[', ']', name);

/** Replaces every character that is not a letter, digit or underscore. */
export function toIdentifier(text: string): string {
    return text.replace(/[^A-Za-z0-9_]/g, '_');
}

export function clip(text: string, limit: number): string {
    return text.length > limit ? text.slice(0, limit) : text;
}

/** A single-quoted SQL string, quotes doubled. */
export function sqlString(text: string): string {
    return `'${text.replace(/'/g, "''")}'`;
}

/** Comment text on one line: line breaks and runs of blanks become one blank. */
export function oneLine(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

/** Comment text with its line breaks kept (as `\n`) and blanks at the ends of lines trimmed. */
export function keepLines(text: string): string {
    return linesOf(text)
        .map((l) => l.trimEnd())
        .join('\n')
        .trim();
}

/** Text split into the lines of a comment. */
export function linesOf(text: string): string[] {
    return text.split(/\r\n|\r|\n/);
}

/** `a, b, c` */
export function commaList(items: readonly string[]): string {
    return items.join(', ');
}

/** The name as written, or the schema-qualified form. */
export function qualify(
    quote: (name: string) => string,
    schema: string | undefined,
    name: string
): string {
    return schema ? `${quote(schema)}.${quote(name)}` : quote(name);
}

/** Distinct values in first-seen order. */
export function firstSeen<T>(items: Iterable<T>): T[] {
    return [...new Set(items)];
}

/**
 * Claims a name no other claim in the same scope took (compared ignoring
 * case). The name is clipped to `limit` first; on a clash a `_2`, `_3`, ...
 * suffix is added and the base is clipped to leave room for it.
 */
export function claimName(
    used: Set<string>,
    base: string,
    limit = Number.POSITIVE_INFINITY
): string {
    const first = clip(base, limit);
    if (!used.has(first.toLowerCase())) {
        used.add(first.toLowerCase());
        return first;
    }
    for (let n = 2; ; n++) {
        const suffix = `_${n}`;
        const candidate = clip(base, limit - suffix.length) + suffix;
        if (!used.has(candidate.toLowerCase())) {
            used.add(candidate.toLowerCase());
            return candidate;
        }
    }
}

/** Scoped name sets: `scope('schema').` gives the set for that scope. */
export function scopes(): (key: string) => Set<string> {
    const map = new Map<string, Set<string>>();
    return (key) => {
        let set = map.get(key);
        if (!set) map.set(key, (set = new Set()));
        return set;
    };
}

/**
 * ` COLLATE name` for a column with a collation, or nothing. A name that is
 * not a plain collation name is left out rather than written into the DDL.
 */
export function collateClause(
    collation: string | undefined,
    quote: (name: string) => string = (n) => n
): string {
    const name = collation?.trim();
    if (!name || name.toLowerCase() === 'default') return '';
    if (!/^[A-Za-z0-9_.$-]+$/.test(name)) return '';
    return ` COLLATE ${quote(name)}`;
}
