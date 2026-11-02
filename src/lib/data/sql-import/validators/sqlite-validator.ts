/**
 * SQLite SQL Validator
 * Validates SQLite SQL syntax and provides helpful error messages
 */

import { validateWithRules, type DialectRules } from './common-validator';
import type { ValidationResult } from './postgresql-validator';

export const sqliteRules: DialectRules = {
    quotes: [
        { open: "'", close: "'" },
        { open: '"', close: '"' },
        { open: '`', close: '`' },
        { open: '[', close: ']' },
    ],
    requiresSemicolons: true,
    viewPattern: /\bCREATE\s+(?:TEMP(?:ORARY)?\s+)?VIEW\b/,
    unsupported: [
        {
            pattern: /\bCREATE\s+SCHEMA\b/,
            message: 'CREATE SCHEMA is not supported in SQLite',
            suggestion: 'Remove schema creation statements for SQLite',
        },
    ],
    foreignSyntax: [
        {
            pattern: /\bENUM\s*\(/,
            message:
                'ENUM type is not supported in SQLite. Use CHECK constraints instead.',
        },
        {
            pattern: /\bAUTO_INCREMENT\b/,
            message:
                'AUTO_INCREMENT is MySQL syntax. Use INTEGER PRIMARY KEY AUTOINCREMENT in SQLite.',
        },
        {
            pattern: /\b(?:BIG|SMALL)?SERIAL\b/,
            message:
                'SERIAL is PostgreSQL syntax. Use INTEGER PRIMARY KEY in SQLite.',
        },
        {
            pattern: /\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/,
            message:
                'GENERATED AS IDENTITY is PostgreSQL syntax. Use INTEGER PRIMARY KEY in SQLite.',
        },
        {
            pattern: /\bIDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)/,
            message:
                'IDENTITY(seed, step) is SQL Server syntax. Use INTEGER PRIMARY KEY in SQLite.',
        },
    ],
};

/**
 * Validates SQLite SQL syntax
 * @param sql - The SQLite SQL to validate
 * @returns ValidationResult with errors and warnings
 */
export function validateSQLiteDialect(sql: string): ValidationResult {
    return validateWithRules(sql, sqliteRules);
}
