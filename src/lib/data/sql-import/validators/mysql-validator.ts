/**
 * MySQL SQL Validator
 * Validates MySQL SQL syntax and provides helpful error messages
 */

import { validateWithRules, type DialectRules } from './common-validator';
import type { ValidationResult } from './postgresql-validator';

export const mysqlRules: DialectRules = {
    quotes: [
        { open: "'", close: "'", backslash: true },
        { open: '"', close: '"', backslash: true },
        { open: '`', close: '`' },
    ],
    requiresSemicolons: true,
    viewPattern:
        /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:ALGORITHM\s*=\s*\w+\s+)?(?:DEFINER\s*=\s*\S+\s+)?(?:SQL\s+SECURITY\s+\w+\s+)?VIEW\b/,
    foreignSyntax: [
        {
            pattern: /\b(?:BIG|SMALL)?SERIAL\b/,
            message:
                'SERIAL is PostgreSQL syntax. Use AUTO_INCREMENT in MySQL.',
        },
        {
            pattern: /\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/,
            message:
                'GENERATED AS IDENTITY is PostgreSQL syntax. Use AUTO_INCREMENT in MySQL.',
        },
        {
            pattern: /\bIDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)/,
            message:
                'IDENTITY(seed, step) is SQL Server syntax. Use AUTO_INCREMENT in MySQL.',
        },
        {
            pattern: /::\s*\w+/,
            message:
                'The :: cast operator is PostgreSQL syntax. Use CAST(... AS ...) in MySQL.',
        },
        {
            pattern: /\[\w+\]/,
            message:
                'Square brackets are SQL Server syntax. Use backticks (`) in MySQL.',
        },
    ],
};

/**
 * Validates MySQL SQL syntax
 * @param sql - The MySQL SQL to validate
 * @returns ValidationResult with errors and warnings
 */
export function validateMySQLDialect(sql: string): ValidationResult {
    return validateWithRules(sql, mysqlRules);
}
