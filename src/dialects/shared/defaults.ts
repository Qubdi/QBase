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

const ESCAPE_CHARS: Record<string, string> = {
    '0': '\0',
    b: '\b',
    n: '\n',
    r: '\r',
    t: '\t',
    Z: '\x1a',
};

/**
 * A MySQL string default written with backslash escapes (`'it\\'s'`, what
 * mysqldump writes) as the one form the design keeps and the writers expect:
 * quotes doubled and every backslash literal. Text that is not one such string
 * is returned as it is.
 */
export function plainStringDefault(text: string): string {
    if (!/^'(?:[^'\\]|\\[\s\S]|'')*'$/.test(text)) return text;
    let body = '';
    const inner = text.slice(1, -1);
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === '\\' && i + 1 < inner.length) {
            const next = inner[++i];
            // \% and \_ keep their backslash (they only mean something in LIKE)
            body +=
                next === '%' || next === '_'
                    ? `\\${next}`
                    : (ESCAPE_CHARS[next] ?? next);
        } else if (ch === "'" && inner[i + 1] === "'") {
            body += "'";
            i++;
        } else body += ch;
    }
    return `'${body.replace(/'/g, "''")}'`;
}

export function isQuotedText(text: string): boolean {
    return SINGLE_QUOTED.test(text);
}

/** True when the text names an automatic number rather than a value. */
export function isNumberingMarker(text: string | undefined): boolean {
    // a quoted value ('my identity') is a value, and the words must stand alone
    // (not `identity_card`), so only a real marker counts
    return (
        text !== undefined &&
        !isQuotedText(text.trim()) &&
        /\b(?:identity|autoincrement|nextval)\b/i.test(text)
    );
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
