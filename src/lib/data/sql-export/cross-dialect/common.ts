export function escapeSQLComment(comment: string): string {
    if (!comment) {
        return '';
    }

    // Escape single quotes by doubling them
    let escaped = comment.replace(/'/g, "''");

    // Replace newlines with spaces to prevent breaking SQL syntax
    // Some databases support multi-line comments with specific syntax,
    // but for maximum compatibility, we'll replace newlines with spaces
    escaped = escaped.replace(/[\r\n]+/g, ' ');

    // Trim any excessive whitespace
    escaped = escaped.replace(/\s+/g, ' ').trim();

    return escaped;
}

/** A name inside "..." with the quote character doubled, so it cannot end the identifier. */
export const quoteDouble = (name: unknown): string =>
    String(name).replace(/"/g, '""');
/** A name inside [...] with ] doubled. */
export const quoteBracket = (name: unknown): string =>
    String(name).replace(/\]/g, ']]');
/** A name inside `...` with the backtick doubled. */
export const quoteBacktick = (name: unknown): string =>
    String(name).replace(/`/g, '``');
/** A name inside '...' (a string literal) with the quote doubled. */
export const quoteSingle = (name: unknown): string =>
    String(name).replace(/'/g, "''");

/**
 * True for a name that is already one well formed quoted identifier: it starts
 * and ends with the quote and holds that quote only doubled. Anything else that
 * merely starts and ends with a quote is a name to quote, not SQL to trust.
 */
export const isQuotedIdentifier = (name: string): boolean =>
    /^"(?:[^"]|"")*"$/.test(name) ||
    /^`(?:[^`]|``)*`$/.test(name) ||
    /^\[(?:[^\]]|\]\])*\]$/.test(name);
