import type { Flavour } from './contract';

const ALLOWED_FUNCTIONS = new Set([
    'LOWER',
    'UPPER',
    'ABS',
    'COALESCE',
    'NULLIF',
    'CHAR_LENGTH',
    'CHARACTER_LENGTH',
    'LEN',
    'LENGTH',
]);
const WORDS = new Set([
    'AND',
    'OR',
    'NOT',
    'IN',
    'BETWEEN',
    'LIKE',
    'IS',
    'NULL',
    'TRUE',
    'FALSE',
]);
const LENGTH_NAMES = new Set([
    'CHAR_LENGTH',
    'CHARACTER_LENGTH',
    'LEN',
    'LENGTH',
]);
const TOKEN =
    /\s+|N'(?:[^']|'')*'|'(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|\d+(?:\.\d+)?|[A-Za-z_][\w$]*|<>|<=|>=|!=|[()=<>+\-*/%,]|[\s\S]/gy;

export type CheckResult = { text: string } | { reason: string };

const lengthFunction: Record<Flavour, string> = {
    postgres: 'CHAR_LENGTH',
    mysql: 'CHAR_LENGTH',
    sqlserver: 'LEN',
    sqlite: 'LENGTH',
    oracle: 'LENGTH',
};

/**
 * A CHECK expression for the target when it is made only of safe parts
 * (EXP-044); otherwise the reason it is not converted.
 */
export function convertCheck(
    expression: string,
    columns: readonly string[],
    quote: (name: string) => string,
    target: Flavour,
    sourceIsMysql: boolean
): CheckResult {
    const byName = new Map(columns.map((c) => [c.toLowerCase(), c]));
    let text = expression.trim();
    // outer parentheses are dropped
    while (
        text.startsWith('(') &&
        text.endsWith(')') &&
        balanced(text.slice(1, -1))
    )
        text = text.slice(1, -1).trim();
    const tokens = text.match(TOKEN) ?? [];
    let out = '';
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (/^\s+$/.test(t)) {
            out += ' ';
            continue;
        }
        if (/^N'/.test(t) || t.startsWith("'")) {
            const bare = t.startsWith('N') ? t.slice(1) : t;
            out += target === 'sqlserver' ? `N${bare}` : bare;
            continue;
        }
        if (/^(?:'|\d|<>|<=|>=|!=|[()=<>+\-*/%,])/.test(t)) {
            out += t;
            continue;
        }
        let name = t;
        if (/^["`[]/.test(t)) name = t.slice(1, -1);
        else {
            const upper = t.toUpperCase();
            const next = tokens.slice(i + 1).find((x) => !/^\s+$/.test(x));
            if (next === '(') {
                if (
                    !ALLOWED_FUNCTIONS.has(upper) ||
                    (upper === 'LENGTH' && sourceIsMysql)
                )
                    return { reason: `the function ${t}` };
                out += LENGTH_NAMES.has(upper) ? lengthFunction[target] : upper;
                continue;
            }
            if (WORDS.has(upper)) {
                // SQL Server and Oracle (before 23ai) have no TRUE and FALSE
                out +=
                    (target === 'sqlserver' || target === 'oracle') &&
                    (upper === 'TRUE' || upper === 'FALSE')
                        ? upper === 'TRUE'
                            ? '1'
                            : '0'
                        : upper;
                continue;
            }
        }
        const column = byName.get(name.toLowerCase());
        if (!column)
            return {
                reason: /^[A-Za-z_]/.test(t)
                    ? `the name ${t}`
                    : `the symbol ${t}`,
            };
        out += quote(column);
    }
    return { text: out.trim() };
}

function balanced(text: string): boolean {
    let depth = 0;
    for (const ch of text) {
        if (ch === '(') depth++;
        else if (ch === ')' && --depth < 0) return false;
    }
    return depth === 0;
}
