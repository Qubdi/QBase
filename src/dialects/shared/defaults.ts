/** Helpers that read the raw default text stored on a column. */

const KEYWORDS = new Set([
    'NULL',
    'TRUE',
    'FALSE',
    'CURRENT_TIMESTAMP',
    'CURRENT_DATE',
    'CURRENT_TIME',
    'CURRENT_USER',
    'SESSION_USER',
    'SYSTEM_USER',
]);

const KNOWN_FORMS = [
    /^CURRENT_TIMESTAMP$/i,
    /^NOW\(\)$/i,
    /^GETDATE\(\)$/i,
    /^CURRENT_DATE$/i,
    /^CURRENT_TIME$/i,
    /^UUID\(\)$/i,
    /^NEWID\(\)$/i,
    /^NEXT VALUE FOR\s.+$/i,
    /^IDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)$/i,
];

const FUNCTION_CALL = /^[A-Za-z_][\w.]*\s*\(.*\)$/s;
const NUMBER = /^-?\d+(\.\d+)?$/;
const SINGLE_QUOTED = /^(?:N)?'(?:[^']|'')*'$/is;

export function isKeywordDefault(text: string): boolean {
    return KEYWORDS.has(text.toUpperCase());
}

export function isKnownForm(text: string): boolean {
    return KNOWN_FORMS.some((re) => re.test(text));
}

export function isFunctionCall(text: string): boolean {
    return FUNCTION_CALL.test(text);
}

export function isNumberText(text: string): boolean {
    return NUMBER.test(text);
}

export function isQuotedText(text: string): boolean {
    return SINGLE_QUOTED.test(text);
}

/** True when the text names an automatic number rather than a value. */
export function isNumberingMarker(text: string | undefined): boolean {
    return text !== undefined && /identity|autoincrement|nextval/i.test(text);
}

/** `'x'::character varying(10)` becomes `'x'`; other text is unchanged. */
export function dropCast(text: string): string {
    const match = /^('(?:[^']|'')*')\s*::.*$/s.exec(text);
    return match ? match[1] : text;
}

/** The text as a single-quoted SQL string, quotes doubled. */
export function asStringLiteral(text: string): string {
    return `'${text.replace(/'/g, "''")}'`;
}

/** Removes one pair of parentheses that wraps the whole text, if any. */
export function unwrapOnce(text: string): string | undefined {
    if (!text.startsWith('(') || !text.endsWith(')')) return undefined;
    let depth = 0;
    let inString = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === "'") inString = !inString;
        if (inString) continue;
        if (ch === '(') depth++;
        if (ch === ')') {
            depth--;
            if (depth === 0 && i < text.length - 1) return undefined;
        }
    }
    return depth === 0 ? text.slice(1, -1).trim() : undefined;
}
