import { makeReader } from '../shared/make-reader';
import type { ReaderProfile } from '../shared/profile';
import type { ValidationRules } from '../shared/validate';

const PROFILE: ReaderProfile = {
    lex: {
        identifierQuotes: ['[', '"'],
        hashComments: false,
        dollarStrings: false,
        backslashEscapes: false,
    },
    goBatches: true,
    arrayTypes: false,
    inlineReferencesAreErrors: false,
    typeSynonyms: {},
    detailedSkips: false,
    viewColumnType: 'varchar',
};

const RULES: ValidationRules = {
    semicolonWarning: false,
    lineRules: [
        {
            pattern: /\bAUTO_INCREMENT\b/i,
            message: 'AUTO_INCREMENT is MySQL syntax, use IDENTITY(1,1)',
        },
        {
            pattern: /\bSERIAL\b/i,
            message: 'SERIAL is PostgreSQL syntax, use IDENTITY(1,1)',
        },
        {
            pattern: /\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i,
            message:
                'GENERATED ... AS IDENTITY is not valid in SQL Server, use IDENTITY(1,1)',
        },
        {
            pattern: /\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/i,
            message: 'CREATE TABLE IF NOT EXISTS is not valid T-SQL',
        },
        {
            pattern: /::/,
            message: 'the :: cast is PostgreSQL syntax, use CAST or CONVERT',
        },
        {
            pattern: /`/,
            message: 'backticks are MySQL syntax, use [name] or "name"',
        },
    ],
};

export const readSqlServer = makeReader(PROFILE, RULES);
