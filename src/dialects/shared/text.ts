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
