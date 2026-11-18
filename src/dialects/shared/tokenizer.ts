import type { Diagnostic } from '../script-model';

export type TokenKind = 'word' | 'ident' | 'string' | 'number' | 'punct';

export interface Token {
    kind: TokenKind;
    /** the characters as written */
    text: string;
    /** words as written, identifiers and strings without their quotes */
    value: string;
    start: number;
    end: number;
    line: number;
    column: number;
}

export interface LexProfile {
    /** characters that open a quoted identifier */
    identifierQuotes: readonly ('"' | '`' | '[')[];
    /** `#` starts a comment to the end of the line */
    hashComments: boolean;
    /** `$tag$ ... $tag$` is one string */
    dollarStrings: boolean;
    /** a backslash escapes a quote inside a string */
    backslashEscapes: boolean;
    /** `"..."` is a string, not a name (MySQL and MariaDB, unless ANSI_QUOTES) */
    doubleQuotedStrings?: boolean;
}

export interface LexResult {
    tokens: Token[];
    problems: Diagnostic[];
}

const TWO_CHAR = new Set([
    '::',
    '||',
    '<>',
    '<=',
    '>=',
    '!=',
    '->',
    '=>',
    ':=',
]);

const isWordStart = (c: string): boolean => /[A-Za-z_\u0080-￿]/.test(c);
const isWordChar = (c: string): boolean => /[A-Za-z0-9_$\u0080-￿]/.test(c);
const isDigit = (c: string): boolean => c >= '0' && c <= '9';

/**
 * Splits SQL text into tokens. Comments are dropped; strings, quoted names
 * and numbers keep their offsets so callers can cut the original text.
 */
export function lex(text: string, profile: LexProfile): LexResult {
    const tokens: Token[] = [];
    const problems: Diagnostic[] = [];
    let line = 1;
    let lineStart = 0;
    let i = 0;
    const n = text.length;

    const advanceTo = (end: number): void => {
        for (let k = i; k < end; k++) {
            if (text[k] === '\n') {
                line++;
                lineStart = k + 1;
            }
        }
        i = end;
    };
    const push = (
        kind: TokenKind,
        start: number,
        end: number,
        value: string,
        startLine: number,
        startColumn: number
    ): void => {
        tokens.push({
            kind,
            text: text.slice(start, end),
            value,
            start,
            end,
            line: startLine,
            column: startColumn,
        });
    };

    while (i < n) {
        const c = text[i];
        const startLine = line;
        const startColumn = i - lineStart + 1;

        if (/\s/.test(c)) {
            advanceTo(i + 1);
            continue;
        }
        if (c === '-' && text[i + 1] === '-') {
            const eol = text.indexOf('\n', i);
            advanceTo(eol < 0 ? n : eol);
            continue;
        }
        if (c === '#' && profile.hashComments) {
            const eol = text.indexOf('\n', i);
            advanceTo(eol < 0 ? n : eol);
            continue;
        }
        if (c === '/' && text[i + 1] === '*') {
            const close = text.indexOf('*/', i + 2);
            if (close < 0) {
                problems.push({
                    severity: 'error',
                    message: 'Unterminated block comment',
                    line: startLine,
                    column: startColumn,
                });
                advanceTo(n);
            } else advanceTo(close + 2);
            continue;
        }
        if (c === "'" || (c === '"' && profile.doubleQuotedStrings)) {
            const prev = text[i - 1];
            const escapes =
                profile.backslashEscapes ||
                (c === "'" &&
                    (prev === 'e' || prev === 'E') &&
                    !isWordChar(text[i - 2] ?? ' '));
            let j = i + 1;
            let value = '';
            let closed = false;
            while (j < n) {
                if (escapes && text[j] === '\\' && j + 1 < n) {
                    value += text[j + 1];
                    j += 2;
                    continue;
                }
                if (text[j] === c) {
                    if (text[j + 1] === c) {
                        value += c;
                        j += 2;
                        continue;
                    }
                    closed = true;
                    j++;
                    break;
                }
                value += text[j];
                j++;
            }
            if (!closed)
                problems.push({
                    severity: 'error',
                    message: 'Unterminated quoted text',
                    line: startLine,
                    column: startColumn,
                });
            push('string', i, j, value, startLine, startColumn);
            advanceTo(j);
            continue;
        }
        if (c === '$' && profile.dollarStrings) {
            const tag = /^\$[A-Za-z_]*\$/.exec(text.slice(i, i + 64));
            if (tag) {
                const close = text.indexOf(tag[0], i + tag[0].length);
                const end = close < 0 ? n : close + tag[0].length;
                if (close < 0)
                    problems.push({
                        severity: 'error',
                        message: 'Unterminated quoted text',
                        line: startLine,
                        column: startColumn,
                    });
                push(
                    'string',
                    i,
                    end,
                    text.slice(i + tag[0].length, close < 0 ? n : close),
                    startLine,
                    startColumn
                );
                advanceTo(end);
                continue;
            }
        }
        if (
            (c === '"' || c === '`' || c === '[') &&
            profile.identifierQuotes.includes(c)
        ) {
            const close = c === '[' ? ']' : c;
            let j = i + 1;
            let value = '';
            let closed = false;
            while (j < n) {
                if (text[j] === close) {
                    if (text[j + 1] === close) {
                        value += close;
                        j += 2;
                        continue;
                    }
                    closed = true;
                    j++;
                    break;
                }
                value += text[j];
                j++;
            }
            if (!closed)
                problems.push({
                    severity: 'error',
                    message: 'Unterminated quoted text',
                    line: startLine,
                    column: startColumn,
                });
            push('ident', i, j, value, startLine, startColumn);
            advanceTo(j);
            continue;
        }
        if (isDigit(c) || (c === '.' && isDigit(text[i + 1] ?? ''))) {
            const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(
                text.slice(i)
            );
            const len = m ? m[0].length : 1;
            push(
                'number',
                i,
                i + len,
                text.slice(i, i + len),
                startLine,
                startColumn
            );
            advanceTo(i + len);
            continue;
        }
        if (
            isWordStart(c) ||
            ((c === '@' || c === '#') && isWordStart(text[i + 1] ?? ''))
        ) {
            let j = i + 1;
            while (j < n && isWordChar(text[j])) j++;
            push('word', i, j, text.slice(i, j), startLine, startColumn);
            advanceTo(j);
            continue;
        }
        const two = text.slice(i, i + 2);
        const len = TWO_CHAR.has(two) ? 2 : 1;
        push(
            'punct',
            i,
            i + len,
            text.slice(i, i + len),
            startLine,
            startColumn
        );
        advanceTo(i + len);
    }
    return { tokens, problems };
}
