/**
 * Shared pre-import validation for the MySQL, SQLite and SQL Server validators.
 * Comments and string literals are masked first, so every check only sees code.
 */

import type {
    ValidationResult,
    ValidationError,
    ValidationWarning,
} from './postgresql-validator';

export interface DialectRules {
    /** Quote characters that delimit identifiers or strings in this dialect */
    quotes: { open: string; close: string; backslash?: boolean }[];
    /** Whether statements are expected to end with a semicolon */
    requiresSemicolons: boolean;
    /** Pattern that matches the dialect's CREATE VIEW statement */
    viewPattern: RegExp;
    /** Syntax that belongs to other dialects, reported as warnings */
    foreignSyntax: { pattern: RegExp; message: string }[];
    /** Syntax the dialect cannot import at all, reported as errors */
    unsupported?: { pattern: RegExp; message: string; suggestion: string }[];
}

const SQL_KEYWORDS =
    /\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT|TABLE|INDEX|VIEW|TRIGGER|FUNCTION|PROCEDURE|GRANT|REVOKE)\b/i;

const CREATE_TABLE =
    /\bCREATE\s+(?:(?:GLOBAL\s+|LOCAL\s+)?TEMP(?:ORARY)?\s+)?TABLE\b/gi;

interface MaskResult {
    masked: string;
    /** 1-based line where an unterminated string or block comment starts */
    unterminated?: { line: number; what: string };
}

/**
 * Replaces comment and quoted text with spaces, keeping newlines so that
 * line numbers stay valid.
 */
export function maskSql(
    sql: string,
    quotes: DialectRules['quotes']
): MaskResult {
    const blank = (text: string) => text.replace(/[^\n]/g, ' ');
    let out = '';
    let line = 1;
    let i = 0;

    while (i < sql.length) {
        const ch = sql[i];
        const next = sql[i + 1];

        if (ch === '-' && next === '-') {
            const end = sql.indexOf('\n', i);
            const stop = end === -1 ? sql.length : end;
            out += blank(sql.slice(i, stop));
            i = stop;
            continue;
        }

        if (ch === '/' && next === '*') {
            const end = sql.indexOf('*/', i + 2);
            if (end === -1) {
                return {
                    masked: out + blank(sql.slice(i)),
                    unterminated: { line, what: 'block comment' },
                };
            }
            const chunk = sql.slice(i, end + 2);
            out += blank(chunk);
            line += (chunk.match(/\n/g) ?? []).length;
            i = end + 2;
            continue;
        }

        const quote = quotes.find((q) => q.open === ch);
        if (quote) {
            const startLine = line;
            let j = i + 1;
            let closed = false;
            while (j < sql.length) {
                if (sql[j] === quote.close) {
                    // a doubled closing quote is an escaped quote
                    if (
                        quote.open === quote.close &&
                        sql[j + 1] === quote.close
                    ) {
                        j += 2;
                        continue;
                    }
                    closed = true;
                    break;
                }
                if (sql[j] === '\\' && quote.backslash) {
                    j += 2;
                    continue;
                }
                j++;
            }
            if (!closed) {
                return {
                    masked: out + blank(sql.slice(i)),
                    unterminated: { line: startLine, what: 'quoted text' },
                };
            }
            const chunk = sql.slice(i, j + 1);
            out += ch + blank(chunk.slice(1, -1)) + quote.close;
            line += (chunk.match(/\n/g) ?? []).length;
            i = j + 1;
            continue;
        }

        if (ch === '\n') line++;
        out += ch;
        i++;
    }

    return { masked: out };
}

const lineOf = (text: string, index: number) =>
    text.slice(0, index).split('\n').length;

export function validateWithRules(
    sql: string,
    rules: DialectRules
): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!sql || !sql.trim()) {
        errors.push({
            line: 1,
            message: 'SQL script is empty',
            type: 'syntax',
            suggestion: 'Add CREATE TABLE statements to import',
        });
        return { isValid: false, errors, warnings, tableCount: 0 };
    }

    const { masked, unterminated } = maskSql(sql, rules.quotes);

    if (!SQL_KEYWORDS.test(masked)) {
        errors.push({
            line: 1,
            message: 'No valid SQL statements found',
            type: 'syntax',
            suggestion:
                'Ensure your SQL contains valid statements like CREATE TABLE',
        });
        return { isValid: false, errors, warnings, tableCount: 0 };
    }

    if (unterminated) {
        errors.push({
            line: unterminated.line,
            message: `Unterminated ${unterminated.what}`,
            type: 'syntax',
            suggestion: `Close the ${unterminated.what}`,
        });
    } else {
        // Unbalanced parentheses
        const open: number[] = [];
        for (let i = 0; i < masked.length; i++) {
            if (masked[i] === '(') {
                open.push(i);
            } else if (masked[i] === ')') {
                if (open.pop() === undefined) {
                    errors.push({
                        line: lineOf(masked, i),
                        message: 'Unmatched closing parenthesis',
                        type: 'syntax',
                        suggestion:
                            'Remove the extra ")" or add the missing "("',
                    });
                    break;
                }
            }
        }
        if (open.length > 0) {
            errors.push({
                line: lineOf(masked, open[0]),
                message: 'Unclosed parenthesis',
                type: 'syntax',
                suggestion: 'Add the missing ")"',
            });
        }
    }

    // Statements that must end with a semicolon to be split correctly
    if (rules.requiresSemicolons && !/;/.test(masked)) {
        warnings.push({
            message: 'SQL statements should end with semicolons (;)',
            type: 'compatibility',
        });
    }

    for (const rule of rules.unsupported ?? []) {
        const match = new RegExp(rule.pattern.source, 'i').exec(masked);
        if (match) {
            errors.push({
                line: lineOf(masked, match.index),
                message: rule.message,
                type: 'unsupported',
                suggestion: rule.suggestion,
            });
        }
    }

    for (const rule of rules.foreignSyntax) {
        const regex = new RegExp(rule.pattern.source, 'gi');
        const lines = new Set<number>();
        for (const match of masked.matchAll(regex)) {
            lines.add(lineOf(masked, match.index));
        }
        [...lines]
            .sort((a, b) => a - b)
            .forEach((line) => {
                warnings.push({
                    message: `Line ${line}: ${rule.message}`,
                    type: 'compatibility',
                });
            });
    }

    const tableCount = (masked.match(CREATE_TABLE) ?? []).length;
    const viewCount = (
        masked.match(new RegExp(rules.viewPattern.source, 'gi')) ?? []
    ).length;

    if (tableCount > 0 || viewCount > 0) {
        const parts: string[] = [];
        if (tableCount > 0) {
            parts.push(`${tableCount} table${tableCount !== 1 ? 's' : ''}`);
        }
        if (viewCount > 0) {
            parts.push(`${viewCount} view${viewCount !== 1 ? 's' : ''}`);
        }
        warnings.unshift({
            message: `Found ${parts.join(' and ')} to import.`,
            type: 'compatibility',
        });
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        tableCount,
        viewCount,
    };
}
