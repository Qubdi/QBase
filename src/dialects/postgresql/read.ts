import type { Diagnostic } from '../script-model';
import { makeReader } from '../shared/make-reader';
import type { ReaderProfile } from '../shared/profile';
import type { ValidationRules } from '../shared/validate';

export const POSTGRES_TYPE_SYNONYMS: Readonly<Record<string, string>> = {
    'character varying': 'varchar',
    'char varying': 'varchar',
    character: 'char',
    bool: 'boolean',
    int2: 'smallint',
    int4: 'int',
    int8: 'bigint',
    float4: 'real',
    float8: 'double precision',
    'timestamp with time zone': 'timestamptz',
    'timestamp without time zone': 'timestamp',
    datetime: 'timestamp',
    'time with time zone': 'timetz',
    'time without time zone': 'time',
    'bit varying': 'varbit',
};

const PROFILE: ReaderProfile = {
    lex: {
        identifierQuotes: ['"'],
        hashComments: false,
        dollarStrings: true,
        backslashEscapes: false,
    },
    goBatches: false,
    arrayTypes: true,
    inlineReferencesAreErrors: false,
    typeSynonyms: POSTGRES_TYPE_SYNONYMS,
    detailedSkips: true,
    viewColumnType: 'text',
};

const BROKEN_CAST = /:[ \t]+:/;
const SPLIT_DECIMAL = /\b(?:DECIMAL|NUMERIC)\s*\(\s*\d+\s*,[ \t]*\n/i;

function firstLine(text: string, pattern: RegExp): number | undefined {
    const m = pattern.exec(text);
    if (!m) return undefined;
    return text.slice(0, m.index).split('\n').length;
}

function postgresChecks(masked: string): Diagnostic[] {
    const out: Diagnostic[] = [];
    const cast = firstLine(masked, BROKEN_CAST);
    if (cast !== undefined)
        out.push({
            severity: 'error',
            message:
                'Invalid cast operator ": :" found. PostgreSQL uses "::" for type casting.',
            line: cast,
            suggestion: 'Replace ": :" with "::"',
            fixable: true,
        });
    const split = firstLine(masked, SPLIT_DECIMAL);
    if (split !== undefined)
        out.push({
            severity: 'error',
            message:
                'DECIMAL type declaration is split across lines. This may cause parsing errors.',
            line: split,
            suggestion: 'Put the precision and scale on one line',
            fixable: true,
        });
    if (/\bCREATE\s+EXTENSION\b/i.test(masked))
        out.push({
            severity: 'warning',
            message:
                'CREATE EXTENSION found. These will be skipped during import.',
        });
    if (/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/i.test(masked))
        out.push({
            severity: 'warning',
            message:
                'Function definitions found. These will be skipped during import.',
        });
    if (
        /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\b/i.test(
            masked
        )
    )
        out.push({
            severity: 'warning',
            message: 'Trigger definitions found. These will not be imported.',
        });
    const statements = (masked.match(/;/g) ?? []).length;
    if (statements > 100)
        out.push({
            severity: 'warning',
            message: `Large SQL file detected (${statements} statements). Import may take some time.`,
        });
    if (/\b(?:GEOGRAPHY|GEOMETRY)\s*\(/i.test(masked))
        out.push({
            severity: 'warning',
            message:
                'PostGIS geographic types detected. These will be imported but may not display geometric data.',
        });
    return out;
}

const RULES: ValidationRules = {
    semicolonWarning: true,
    lineRules: [],
    extra: postgresChecks,
};

export const readPostgres = makeReader(PROFILE, RULES);

/** Repairs the two errors the validator marks as fixable. */
export function fixPostgres(text: string): string {
    return text
        .replace(/:[ \t]+:/g, '::')
        .replace(
            /\b(DECIMAL|NUMERIC)(\s*)\(\s*(\d+)\s*,\s*\n\s*(\d+)\s*\)/gi,
            '$1$2($3, $4)'
        );
}
