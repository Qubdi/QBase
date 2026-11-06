import { makeReader } from '../shared/make-reader';
import type { ReaderProfile } from '../shared/profile';
import type { ValidationRules } from '../shared/validate';

const PROFILE: ReaderProfile = {
    lex: {
        identifierQuotes: ['`'],
        hashComments: true,
        dollarStrings: false,
        backslashEscapes: true,
    },
    goBatches: false,
    arrayTypes: false,
    inlineReferencesAreErrors: true,
    typeSynonyms: {},
    detailedSkips: false,
    viewColumnType: 'text',
};

const RULES: ValidationRules = {
    semicolonWarning: true,
    lineRules: [
        {
            pattern: /\bSERIAL\b/i,
            message: 'SERIAL is not valid in MySQL, use AUTO_INCREMENT',
        },
        {
            pattern: /\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i,
            message:
                'GENERATED ... AS IDENTITY is not valid in MySQL, use AUTO_INCREMENT',
        },
        {
            pattern: /\bIDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)/i,
            message: 'IDENTITY(a,b) is SQL Server syntax, use AUTO_INCREMENT',
        },
        { pattern: /::/, message: 'the :: cast is PostgreSQL syntax' },
        {
            pattern: /\[[A-Za-z_]\w*\]/,
            message: '[name] brackets are SQL Server syntax, use backticks',
        },
    ],
};

export const readMysql = makeReader(PROFILE, RULES);
