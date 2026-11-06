import type { Diagnostic } from '../script-model';
import type { LexProfile } from './tokenizer';

/** A rule that looks for foreign syntax, line by line, in the masked text. */
export interface LineRule {
    pattern: RegExp;
    message: string;
    severity?: 'error' | 'warning';
    suggestion?: string;
}

export interface ValidationRules {
    /** warn when no `;` is found anywhere */
    semicolonWarning: boolean;
    lineRules: readonly LineRule[];
    /** extra checks that need the whole masked text */
    extra?: (masked: string) => Diagnostic[];
}

export interface Masked {
    text: string;
    problems: Diagnostic[];
}

/**
 * Blanks comments and quoted text with spaces (line breaks stay), so that
 * checks see only code. Reports quoted text or comments left open.
 */
export function maskCode(source: string, profile: LexProfile): Masked {
    const problems: Diagnostic[] = [];
    let out = '';
    let line = 1;
    let i = 0;
    const n = source.length;
    const blank = (from: number, to: number): void => {
        for (let k = from; k < to; k++) {
            const ch = source[k];
            out += ch === '\n' ? '\n' : ' ';
            if (ch === '\n') line++;
        }
    };
    while (i < n) {
        const c = source[i];
        const two = source.slice(i, i + 2);
        if (two === '--' || (c === '#' && profile.hashComments)) {
            const eol = source.indexOf('\n', i);
            const end = eol < 0 ? n : eol;
            blank(i, end);
            i = end;
        } else if (two === '/*') {
            const close = source.indexOf('*/', i + 2);
            if (close < 0) {
                problems.push({
                    severity: 'error',
                    message: 'Unterminated block comment',
                    line,
                    suggestion: 'Close the comment with */',
                });
            }
            const end = close < 0 ? n : close + 2;
            blank(i, end);
            i = end;
        } else if (
            c === "'" ||
            (c === '"' && profile.identifierQuotes.includes('"')) ||
            (c === '`' && profile.identifierQuotes.includes('`'))
        ) {
            const startLine = line;
            let j = i + 1;
            let closed = false;
            while (j < n) {
                if (
                    profile.backslashEscapes &&
                    c === "'" &&
                    source[j] === '\\'
                ) {
                    j += 2;
                    continue;
                }
                if (source[j] === c) {
                    if (source[j + 1] === c) {
                        j += 2;
                        continue;
                    }
                    closed = true;
                    j++;
                    break;
                }
                j++;
            }
            if (!closed)
                problems.push({
                    severity: 'error',
                    message: 'Unterminated quoted text',
                    line: startLine,
                    suggestion: `Close the text with ${c}`,
                });
            const end = Math.min(j, n);
            blank(i, end);
            i = end;
        } else if (c === '[' && profile.identifierQuotes.includes('[')) {
            const close = source.indexOf(']', i + 1);
            const end = close < 0 ? i + 1 : close + 1;
            blank(i, end);
            i = end;
        } else if (
            c === '$' &&
            profile.dollarStrings &&
            /^\$[A-Za-z_]*\$/.test(source.slice(i, i + 64))
        ) {
            const tag = /^\$[A-Za-z_]*\$/.exec(source.slice(i, i + 64))![0];
            const close = source.indexOf(tag, i + tag.length);
            const end = close < 0 ? n : close + tag.length;
            blank(i, end);
            i = end;
        } else {
            out += c;
            if (c === '\n') line++;
            i++;
        }
    }
    return { text: out, problems };
}

const SQL_WORDS =
    /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT|TABLE|INDEX|VIEW|TRIGGER|FUNCTION|PROCEDURE|GRANT|REVOKE)\b/i;

/** Checks that need no parser: structure, brackets and foreign syntax. */
export function validateText(
    source: string,
    lexProfile: LexProfile,
    rules: ValidationRules
): Diagnostic[] {
    if (source.trim() === '')
        return [
            {
                severity: 'error',
                message: 'SQL script is empty',
                line: 1,
                suggestion: 'Add CREATE TABLE statements to import',
            },
        ];
    const { text, problems } = maskCode(source, lexProfile);
    const out: Diagnostic[] = [...problems];

    if (!SQL_WORDS.test(text))
        out.push({
            severity: 'error',
            message: 'No valid SQL statements found',
            line: 1,
            suggestion: 'Add CREATE TABLE statements to import',
        });

    let depth = 0;
    let firstOpen: number | undefined;
    let line = 1;
    let unmatched = false;
    for (let i = 0; i < text.length && !unmatched; i++) {
        const ch = text[i];
        if (ch === '\n') line++;
        else if (ch === '(') {
            if (depth === 0) firstOpen = line;
            depth++;
        } else if (ch === ')') {
            if (depth === 0) {
                out.push({
                    severity: 'error',
                    message: 'Unmatched closing parenthesis',
                    line,
                });
                unmatched = true;
            } else depth--;
        }
    }
    if (!unmatched && depth > 0)
        out.push({
            severity: 'error',
            message: 'Unclosed parenthesis',
            line: firstOpen,
        });

    if (rules.semicolonWarning && !text.includes(';'))
        out.push({
            severity: 'warning',
            message: 'SQL statements should end with semicolons (;)',
        });

    const lines = text.split('\n');
    lines.forEach((content, index) => {
        for (const rule of rules.lineRules) {
            if (!rule.pattern.test(content)) continue;
            const isError = rule.severity === 'error';
            out.push({
                severity: rule.severity ?? 'warning',
                message: isError
                    ? rule.message
                    : `Line ${index + 1}: ${rule.message}`,
                line: index + 1,
                suggestion: rule.suggestion,
            });
            if (!isError) break;
        }
    });

    if (rules.extra) out.push(...rules.extra(text));

    const tables = (
        text.match(
            /\bCREATE\s+(?:OR\s+(?:REPLACE|ALTER)\s+)?(?:(?:GLOBAL|LOCAL|TEMP|TEMPORARY|UNLOGGED)\s+)*TABLE\b/gi
        ) ?? []
    ).length;
    const views = (
        text.match(
            /\bCREATE\s+(?:OR\s+(?:REPLACE|ALTER)\s+)?(?:(?:TEMP|TEMPORARY|MATERIALIZED|RECURSIVE)\s+)*VIEW\b/gi
        ) ?? []
    ).length;
    if (tables + views > 0)
        out.unshift({
            severity: 'info',
            message: `Found ${tables} table${tables === 1 ? '' : 's'}${
                views > 0 ? ` and ${views} view${views === 1 ? '' : 's'}` : ''
            } to import.`,
        });
    return out;
}
