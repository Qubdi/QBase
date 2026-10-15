/**
 * SQL Server SQL Validator
 * Validates SQL Server (T-SQL) syntax and provides helpful error messages
 */

import { validateWithRules, type DialectRules } from './common-validator';
import type { ValidationResult } from './postgresql-validator';

export const sqlServerRules: DialectRules = {
    quotes: [
        { open: "'", close: "'" },
        { open: '"', close: '"' },
        { open: '[', close: ']' },
    ],
    // T-SQL separates statements with GO or plain newlines as well
    requiresSemicolons: false,
    viewPattern: /\bCREATE\s+(?:OR\s+ALTER\s+)?VIEW\b/,
    foreignSyntax: [
        {
            pattern: /\bAUTO_INCREMENT\b/,
            message:
                'AUTO_INCREMENT is MySQL syntax. Use IDENTITY in SQL Server.',
        },
        {
            pattern: /\b(?:BIG|SMALL)?SERIAL\b/,
            message: 'SERIAL is PostgreSQL syntax. Use IDENTITY in SQL Server.',
        },
        {
            pattern: /\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/,
            message:
                'GENERATED AS IDENTITY is PostgreSQL syntax. Use IDENTITY(1,1) in SQL Server.',
        },
        {
            pattern: /\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/,
            message:
                'CREATE TABLE IF NOT EXISTS is not supported in SQL Server. Use IF OBJECT_ID(...) IS NULL.',
        },
        {
            pattern: /::\s*\w+/,
            message:
                'The :: cast operator is PostgreSQL syntax. Use CAST(... AS ...) in SQL Server.',
        },
        {
            pattern: /`/,
            message:
                'Backticks are MySQL syntax. Use square brackets ([ ]) in SQL Server.',
        },
    ],
};

/**
 * Validates SQL Server SQL syntax
 * @param sql - The SQL Server SQL to validate
 * @returns ValidationResult with errors and warnings
 */
export function validateSQLServerDialect(sql: string): ValidationResult {
    return validateWithRules(sql, sqlServerRules);
}
