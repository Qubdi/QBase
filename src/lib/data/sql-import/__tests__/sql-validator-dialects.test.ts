import { describe, it, expect } from 'vitest';
import { validateSQL } from '../sql-validator';
import { DatabaseType } from '@/lib/domain/database-type';

const dialects = [
    DatabaseType.MYSQL,
    DatabaseType.MARIADB,
    DatabaseType.SQLITE,
    DatabaseType.SQL_SERVER,
];

describe.each(dialects)('shared checks (%s)', (type) => {
    it('rejects empty input', () => {
        const result = validateSQL('  \n ', type);
        expect(result.isValid).toBe(false);
        expect(result.errors[0].message).toBe('SQL script is empty');
    });

    it('rejects text with no SQL statements', () => {
        const result = validateSQL('hello world', type);
        expect(result.isValid).toBe(false);
        expect(result.errors[0].message).toBe('No valid SQL statements found');
    });

    it('accepts a valid table and counts it', () => {
        const result = validateSQL(
            'CREATE TABLE a (id INT PRIMARY KEY);\nCREATE TABLE b (id INT);',
            type
        );
        expect(result.isValid).toBe(true);
        expect(result.tableCount).toBe(2);
        expect(result.warnings[0].message).toBe('Found 2 tables to import.');
    });

    it('counts several statements on one line', () => {
        const result = validateSQL(
            'CREATE TABLE a (id INT); CREATE TABLE b (id INT);',
            type
        );
        expect(result.tableCount).toBe(2);
    });

    it('reports an unclosed parenthesis with its line', () => {
        const result = validateSQL(
            'CREATE TABLE a (\n  id INT,\n  name TEXT;\n',
            type
        );
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toMatchObject({
            line: 1,
            message: 'Unclosed parenthesis',
        });
    });

    it('reports an unmatched closing parenthesis', () => {
        const result = validateSQL('CREATE TABLE a (id INT));', type);
        expect(result.errors[0].message).toBe('Unmatched closing parenthesis');
    });

    it('reports an unterminated block comment', () => {
        const result = validateSQL(
            'CREATE TABLE a (id INT);\n/* never closed',
            type
        );
        expect(result.errors[0]).toMatchObject({
            line: 2,
            message: 'Unterminated block comment',
        });
    });

    it('ignores parentheses and keywords inside comments and strings', () => {
        const result = validateSQL(
            [
                '-- CREATE TABLE ghost (',
                "CREATE TABLE a (id INT DEFAULT 0, note TEXT DEFAULT ':-)');",
                '/* CREATE TABLE other ( */',
            ].join('\n'),
            type
        );
        expect(result.isValid).toBe(true);
        expect(result.tableCount).toBe(1);
    });
});

describe('MySQL', () => {
    it('warns about PostgreSQL and SQL Server syntax with line numbers', () => {
        const result = validateSQL(
            'CREATE TABLE a (\n  id SERIAL,\n  [name] TEXT,\n  n INT DEFAULT 1::int\n);',
            DatabaseType.MYSQL
        );
        const messages = result.warnings.map((w) => w.message);
        expect(messages).toContain(
            'Line 2: SERIAL is PostgreSQL syntax. Use AUTO_INCREMENT in MySQL.'
        );
        expect(messages.some((m) => m.startsWith('Line 3: Square'))).toBe(true);
        expect(messages.some((m) => m.startsWith('Line 4: The ::'))).toBe(true);
    });

    it('does not flag SERIAL inside a string', () => {
        const result = validateSQL(
            "CREATE TABLE a (kind VARCHAR(10) DEFAULT 'SERIAL');",
            DatabaseType.MYSQL
        );
        expect(result.warnings.map((w) => w.message)).toEqual([
            'Found 1 table to import.',
        ]);
    });

    it('handles backslash-escaped quotes and counts views', () => {
        const result = validateSQL(
            "CREATE TABLE a (n VARCHAR(5) DEFAULT 'it\\'s (');\nCREATE ALGORITHM=MERGE VIEW v AS SELECT 1;",
            DatabaseType.MYSQL
        );
        expect(result.isValid).toBe(true);
        expect(result.tableCount).toBe(1);
        expect(result.viewCount).toBe(1);
    });

    it('warns when no statement ends with a semicolon', () => {
        const result = validateSQL(
            'CREATE TABLE a (id INT)',
            DatabaseType.MYSQL
        );
        expect(result.warnings.map((w) => w.message)).toContain(
            'SQL statements should end with semicolons (;)'
        );
    });
});

describe('SQLite', () => {
    it('rejects CREATE SCHEMA', () => {
        const result = validateSQL(
            'CREATE SCHEMA app;\nCREATE TABLE a (id INTEGER);',
            DatabaseType.SQLITE
        );
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toMatchObject({
            line: 1,
            type: 'unsupported',
        });
    });

    it('warns about ENUM and AUTO_INCREMENT', () => {
        const result = validateSQL(
            "CREATE TABLE a (\n  id INT AUTO_INCREMENT,\n  s ENUM('x','y')\n);",
            DatabaseType.SQLITE
        );
        const messages = result.warnings.map((w) => w.message);
        expect(
            messages.some((m) => m.startsWith('Line 2: AUTO_INCREMENT'))
        ).toBe(true);
        expect(messages.some((m) => m.startsWith('Line 3: ENUM'))).toBe(true);
    });

    it('accepts bracket-quoted identifiers', () => {
        const result = validateSQL(
            'CREATE TABLE [my (table] (id INTEGER);',
            DatabaseType.SQLITE
        );
        expect(result.isValid).toBe(true);
    });
});

describe('SQL Server', () => {
    it('does not require semicolons', () => {
        const result = validateSQL(
            'CREATE TABLE [dbo].[a] (id INT IDENTITY(1,1))\nGO',
            DatabaseType.SQL_SERVER
        );
        expect(result.isValid).toBe(true);
        expect(result.warnings.map((w) => w.message)).toEqual([
            'Found 1 table to import.',
        ]);
    });

    it('warns about MySQL and PostgreSQL syntax', () => {
        const result = validateSQL(
            'CREATE TABLE IF NOT EXISTS `a` (\n  id INT AUTO_INCREMENT,\n  k SERIAL\n);',
            DatabaseType.SQL_SERVER
        );
        const messages = result.warnings.map((w) => w.message);
        expect(messages.some((m) => m.includes('IF NOT EXISTS'))).toBe(true);
        expect(
            messages.some((m) => m.startsWith('Line 2: AUTO_INCREMENT'))
        ).toBe(true);
        expect(messages.some((m) => m.startsWith('Line 3: SERIAL'))).toBe(true);
        expect(messages.some((m) => m.includes('Backticks'))).toBe(true);
    });

    it('counts CREATE OR ALTER VIEW', () => {
        const result = validateSQL(
            'CREATE OR ALTER VIEW v AS SELECT 1 AS x;',
            DatabaseType.SQL_SERVER
        );
        expect(result.viewCount).toBe(1);
    });
});
