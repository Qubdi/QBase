import { makeReader } from '../shared/make-reader';
import type { ReaderProfile } from '../shared/profile';
import type { ValidationRules } from '../shared/validate';

const PROFILE: ReaderProfile = {
    lex: {
        identifierQuotes: ['"', '`', '['],
        hashComments: false,
        dollarStrings: false,
        backslashEscapes: false,
    },
    goBatches: false,
    arrayTypes: false,
    inlineReferencesAreErrors: false,
    typeSynonyms: {},
    detailedSkips: false,
    viewColumnType: 'text',
};

const RULES: ValidationRules = {
    semicolonWarning: true,
    lineRules: [
        {
            pattern: /\bCREATE\s+SCHEMA\b/i,
            severity: 'error',
            message: 'CREATE SCHEMA is not supported in SQLite',
            suggestion: 'Remove schema creation statements for SQLite',
        },
        {
            pattern: /\bENUM\s*\(/i,
            message: 'ENUM is not supported in SQLite, use a CHECK constraint',
        },
        {
            pattern: /\bAUTO_INCREMENT\b/i,
            message: 'AUTO_INCREMENT is MySQL syntax, use AUTOINCREMENT',
        },
        {
            pattern: /\bSERIAL\b/i,
            message:
                'SERIAL is PostgreSQL syntax, use INTEGER PRIMARY KEY AUTOINCREMENT',
        },
        {
            pattern: /\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i,
            message:
                'GENERATED ... AS IDENTITY is not valid in SQLite, use AUTOINCREMENT',
        },
        {
            pattern: /\bIDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)/i,
            message: 'IDENTITY(a,b) is SQL Server syntax, use AUTOINCREMENT',
        },
    ],
};

export const readSqlite = makeReader(PROFILE, RULES);
