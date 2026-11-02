import type { Canon, SourceDialect, TargetDialect } from './canonical';

export type CheckResult =
    { ok: true; sql: string } | { ok: false; reason: string };

type Token =
    | { t: 'id'; name: string }
    | { t: 'str'; raw: string }
    | { t: 'num'; raw: string }
    | { t: 'kw'; word: string }
    /** a function that every database has, under its own name */
    | { t: 'fn'; text: string }
    | { t: 'op'; op: string };

/** the only words a portable CHECK is made of, besides column names */
const KEYWORDS = new Set([
    'and',
    'or',
    'not',
    'in',
    'between',
    'like',
    'is',
    'null',
    'true',
    'false',
]);

/** functions that mean the same everywhere */
const SAME_EVERYWHERE = new Set([
    'lower',
    'upper',
    'abs',
    'coalesce',
    'nullif',
]);

const LENGTH_NAME: Record<TargetDialect, string> = {
    postgresql: 'CHAR_LENGTH',
    mysql: 'CHAR_LENGTH',
    sqlserver: 'LEN',
    sqlite: 'LENGTH',
};

/**
 * The target's spelling of a function, or null when it has no safe
 * equivalent. LENGTH counts bytes in MySQL and characters elsewhere, so it is
 * only read as a character count when it comes from a database where it is.
 */
const functionFor = (
    name: string,
    source: SourceDialect,
    target: TargetDialect
): string | null => {
    const lower = name.toLowerCase();
    if (SAME_EVERYWHERE.has(lower)) return lower.toUpperCase();
    if (['char_length', 'character_length', 'len'].includes(lower))
        return LENGTH_NAME[target];
    if (lower === 'length' && source !== 'mysql') return LENGTH_NAME[target];
    return null;
};

/** `((a > 0))` -> `a > 0`: the caller wraps it in CHECK (...) itself */
const withoutOuterParens = (sql: string): string => {
    let s = sql;
    for (;;) {
        if (!s.startsWith('(') || !s.endsWith(')')) return s;
        let depth = 0;
        let quote = false;
        let wrapsAll = true;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (ch === "'") quote = !quote;
            if (quote) continue;
            if (ch === '(') depth++;
            if (ch === ')') depth--;
            if (depth === 0 && i < s.length - 1) {
                wrapsAll = false;
                break;
            }
        }
        if (!wrapsAll) return s;
        s = s.slice(1, -1).trim();
    }
};

const quoteName = (name: string, target: TargetDialect): string => {
    switch (target) {
        case 'mysql':
            return `\`${name.replace(/`/g, '``')}\``;
        case 'sqlserver':
            return `[${name.replace(/]/g, ']]')}]`;
        default:
            return `"${name.replace(/"/g, '""')}"`;
    }
};

const OPERATORS = [
    '<>',
    '!=',
    '<=',
    '>=',
    '=',
    '<',
    '>',
    '+',
    '-',
    '*',
    '/',
    '%',
    '(',
    ')',
    ',',
];

/**
 * Rewrites a CHECK expression for another dialect. Only expressions made of
 * column names, literals, comparisons and AND / OR / NOT / IN / BETWEEN / LIKE
 * / IS NULL are converted: a function, a cast or a dialect operator has no
 * safe translation, so those are reported instead of guessed at.
 */
export function convertCheck(
    expression: string,
    source: SourceDialect,
    target: TargetDialect,
    columns: Map<string, Canon>
): CheckResult {
    let src = expression.trim();
    const wrapped = src.match(/^check\s*(\(.*\))$/is);
    if (wrapped) src = wrapped[1];

    const tokens: Token[] = [];
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        if (/\s/.test(ch)) {
            i++;
            continue;
        }
        if (ch === "'") {
            let j = i + 1;
            for (;;) {
                if (j >= src.length)
                    return { ok: false, reason: 'an unterminated string' };
                if (src[j] === "'") {
                    if (src[j + 1] === "'") {
                        j += 2;
                        continue;
                    }
                    break;
                }
                if (src[j] === '\\') {
                    return {
                        ok: false,
                        reason: 'a string with a backslash escape',
                    };
                }
                j++;
            }
            tokens.push({ t: 'str', raw: src.slice(i, j + 1) });
            i = j + 1;
            continue;
        }
        const close = { '"': '"', '`': '`', '[': ']' }[ch];
        if (close) {
            const j = src.indexOf(close, i + 1);
            if (j < 0) return { ok: false, reason: 'an unterminated name' };
            tokens.push({ t: 'id', name: src.slice(i + 1, j) });
            i = j + 1;
            continue;
        }
        const num = src.slice(i).match(/^\d+(\.\d+)?([eE][+-]?\d+)?/);
        if (num) {
            tokens.push({ t: 'num', raw: num[0] });
            i += num[0].length;
            continue;
        }
        const word = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_$]*/);
        if (word) {
            const lower = word[0].toLowerCase();
            const rest = src.slice(i + word[0].length).trimStart();
            if (KEYWORDS.has(lower)) {
                tokens.push({ t: 'kw', word: lower });
            } else if (rest.startsWith('(')) {
                const fn = functionFor(word[0], source, target);
                if (!fn) {
                    return { ok: false, reason: `the function ${word[0]}()` };
                }
                tokens.push({ t: 'fn', text: fn });
                i += word[0].length;
                continue;
            } else if (columns.has(lower)) {
                tokens.push({ t: 'id', name: word[0] });
            } else {
                return {
                    ok: false,
                    reason: `${word[0]}, which is not a column`,
                };
            }
            i += word[0].length;
            continue;
        }
        const op = OPERATORS.find((o) => src.startsWith(o, i));
        if (op) {
            tokens.push({ t: 'op', op });
            i += op.length;
            continue;
        }
        const shown = src.slice(i, i + 2) === '::' ? '::' : ch;
        return { ok: false, reason: `the operator ${shown}` };
    }

    for (const tok of tokens) {
        if (tok.t === 'id' && !columns.has(tok.name.toLowerCase())) {
            return { ok: false, reason: `${tok.name}, which is not a column` };
        }
    }

    // PostgreSQL will not compare a boolean with a number
    if (target === 'postgresql') {
        const usesBool = tokens.some(
            (t) =>
                t.t === 'id' &&
                columns.get(t.name.toLowerCase())?.kind === 'bool'
        );
        if (usesBool && tokens.some((t) => t.t === 'num')) {
            return {
                ok: false,
                reason: 'a boolean column compared with a number',
            };
        }
    }

    let out = '';
    tokens.forEach((tok, k) => {
        const prev = tokens[k - 1];
        const beforePrev = tokens[k - 2];
        let text: string;
        switch (tok.t) {
            case 'id':
                text = quoteName(tok.name, target);
                break;
            case 'str':
            case 'num':
                text = tok.raw;
                break;
            case 'fn':
                text = tok.text;
                break;
            case 'kw':
                if (tok.word === 'true' || tok.word === 'false') {
                    text =
                        target === 'sqlserver'
                            ? tok.word === 'true'
                                ? '1'
                                : '0'
                            : tok.word.toUpperCase();
                } else {
                    text = tok.word.toUpperCase();
                }
                break;
            case 'op':
                text = tok.op === '!=' ? '<>' : tok.op;
                break;
        }
        const closes = tok.t === 'op' && (tok.op === ')' || tok.op === ',');
        const afterOpen = prev?.t === 'op' && prev.op === '(';
        // a minus that starts a value sticks to it: -1, not - 1
        const unaryMinus =
            prev?.t === 'op' &&
            prev.op === '-' &&
            (!beforePrev ||
                beforePrev.t === 'kw' ||
                (beforePrev.t === 'op' && beforePrev.op !== ')'));
        const opensCall = tok.t === 'op' && tok.op === '(' && prev?.t === 'fn';
        if (out && !closes && !afterOpen && !unaryMinus && !opensCall)
            out += ' ';
        out += text;
    });
    return { ok: true, sql: withoutOuterParens(out) };
}
