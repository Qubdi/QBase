import { i18n } from '@/i18n/i18n';

// The import and export engines write plain English. People read it through
// this file: each known message is matched and shown from the language files,
// and a message not listed here is shown exactly as the engine wrote it.

type Params = Record<string, string | number>;
type Rule = [
    pattern: RegExp,
    key: string,
    params?: (m: RegExpMatchArray) => Params,
];

const exact = (text: string, key: string): Rule => [
    new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    key,
];

const P = 'editor.diagnostics.';

const RULES: Rule[] = [
    exact('Nothing to import', 'nothingToImport'),
    exact('Nothing to export', 'nothingToExport'),
    exact('SQL script is empty', 'emptyScript'),
    exact('No valid SQL statements found', 'noStatements'),
    exact('Add CREATE TABLE statements to import', 'addCreateTable'),
    exact('SQL statements should end with semicolons (;)', 'noSemicolon'),
    exact('Unterminated block comment', 'unterminatedComment'),
    exact('Close the comment with */', 'closeComment'),
    exact('Unterminated quoted text', 'unterminatedText'),
    [/^Close the text with (.+)$/, 'closeText', (m) => ({ quote: m[1] })],
    exact('Unmatched closing parenthesis', 'unmatchedParen'),
    exact('Unclosed parenthesis', 'unclosedParen'),
    exact(
        'SERIAL is not valid in MySQL, use AUTO_INCREMENT',
        'dialectSyntax.serialMysql'
    ),
    exact(
        'GENERATED ... AS IDENTITY is not valid in MySQL, use AUTO_INCREMENT',
        'dialectSyntax.identityMysql'
    ),
    exact(
        'IDENTITY(a,b) is SQL Server syntax, use AUTO_INCREMENT',
        'dialectSyntax.sqlServerIdentityMysql'
    ),
    exact(
        'AUTO_INCREMENT is MySQL syntax, use IDENTITY(1,1)',
        'dialectSyntax.autoIncrementSqlServer'
    ),
    exact(
        'SERIAL is PostgreSQL syntax, use IDENTITY(1,1)',
        'dialectSyntax.serialSqlServer'
    ),
    exact(
        'GENERATED ... AS IDENTITY is not valid in SQL Server, use IDENTITY(1,1)',
        'dialectSyntax.identitySqlServer'
    ),
    exact(
        'CREATE TABLE IF NOT EXISTS is not valid T-SQL',
        'dialectSyntax.ifNotExistsSqlServer'
    ),
    exact(
        'CREATE SCHEMA is not supported in SQLite',
        'dialectSyntax.schemaSqlite'
    ),
    exact(
        'Remove schema creation statements for SQLite',
        'dialectSyntax.removeSchemaSqlite'
    ),
    exact(
        'ENUM is not supported in SQLite, use a CHECK constraint',
        'dialectSyntax.enumSqlite'
    ),
    exact(
        'AUTO_INCREMENT is MySQL syntax, use AUTOINCREMENT',
        'dialectSyntax.autoIncrementSqlite'
    ),
    exact(
        'SERIAL is PostgreSQL syntax, use INTEGER PRIMARY KEY AUTOINCREMENT',
        'dialectSyntax.serialSqlite'
    ),
    exact(
        'GENERATED ... AS IDENTITY is not valid in SQLite, use AUTOINCREMENT',
        'dialectSyntax.identitySqlite'
    ),
    exact(
        'IDENTITY(a,b) is SQL Server syntax, use AUTOINCREMENT',
        'dialectSyntax.sqlServerIdentitySqlite'
    ),
    [
        /^MySQL does not support inline REFERENCES in column definitions \(line (\d+)\)\. Please use FOREIGN KEY constraints instead:$/,
        'dialectSyntax.inlineReferencesMysql',
        (m) => ({ line: m[1] }),
    ],
    exact(
        'Invalid cast operator ": :" found. PostgreSQL uses "::" for type casting.',
        'postgres.brokenCast'
    ),
    exact('Replace ": :" with "::"', 'postgres.fixCast'),
    exact(
        'DECIMAL type declaration is split across lines. This may cause parsing errors.',
        'postgres.splitDecimal'
    ),
    exact('Put the precision and scale on one line', 'postgres.fixDecimal'),
    exact(
        'CREATE EXTENSION found. These will be skipped during import.',
        'postgres.extension'
    ),
    exact(
        'Function definitions found. These will be skipped during import.',
        'postgres.functions'
    ),
    exact(
        'Trigger definitions found. These will not be imported.',
        'postgres.triggers'
    ),
    [
        /^Large SQL file detected \((\d+) statements\)\. Import may take some time\.$/,
        'postgres.large',
        (m) => ({ count: m[1] }),
    ],
    exact(
        'PostGIS geographic types detected. These will be imported but may not display geometric data.',
        'postgres.postgis'
    ),
    [
        /^View (.+) has no columns that can be read from its definition\.$/,
        'import.viewNoColumns',
        (m) => ({ name: m[1] }),
    ],
    [
        /^(\d+) (.+) statements? skipped: not imported\.$/,
        'import.skipped',
        (m) => ({ count: Number(m[1]), kind: m[2] }),
    ],
    [
        /^Foreign key on (.+) dropped: table (.+) is not in the script\.$/,
        'import.linkTableMissing',
        (m) => ({ table: m[1], ref: m[2] }),
    ],
    [
        /^Foreign key on (.+) dropped: its columns do not match\.$/,
        'import.linkColumnsMismatch',
        (m) => ({ table: m[1] }),
    ],
    [
        /^Foreign key (.+) dropped: a table or column is missing\.$/,
        'import.linkNamedMissing',
        (m) => ({ name: m[1] }),
    ],
    [
        /^(\d+) foreign key row\(s\) dropped: a table or column is not in the import\.$/,
        'import.rowsDropped',
        (m) => ({ count: Number(m[1]) }),
    ],
    exact('Unsupported database type', 'import.unsupportedType'),
    exact('Invalid DBML', 'import.invalidDbml'),
    exact(
        'Invalid relationship: tables or fields not found',
        'import.invalidRelationship'
    ),
    [
        /^Many-to-many references \(<>\) are not supported: "(.*)" and "(.*)"\. Add a junction table that references both\.$/,
        'import.manyToMany',
        (m) => ({ left: m[1], right: m[2] }),
    ],
    [
        /^Index references non-existent column: (.+)$/,
        'import.missingIndexColumn',
        (m) => ({ name: m[1] }),
    ],
    [
        /^Array types are not supported for (.+) database\. Field "(.*)" has array type "(.*)" which is not allowed\.$/,
        'import.arrayType',
        (m) => ({ dialect: m[1], field: m[2], type: m[3] }),
    ],
    [
        /^Table (.+) lost (\d+) field\(s\) without a name\.$/,
        'export.lostFields',
        (m) => ({ name: m[1], count: Number(m[2]) }),
    ],
    [
        /^Table (.+) was left out: another table has the same name\.$/,
        'export.leftOutDuplicate',
        (m) => ({ name: m[1] }),
    ],
    [
        /^Table (.+) was left out: it has no fields\.$/,
        'export.leftOutEmpty',
        (m) => ({ name: m[1] }),
    ],
    [
        /^SQL export is not supported for (.+) diagrams$/,
        'export.notSupportedForDiagrams',
        (m) => ({ label: m[1] }),
    ],
    [
        /^SQL export is not supported for (.+)$/,
        'export.notSupportedFor',
        (m) => ({ label: m[1] }),
    ],
    [
        /^Conversion to (.+) is not supported$/,
        'export.conversion',
        (m) => ({ label: m[1] }),
    ],
    exact('The expression is empty', 'check.empty'),
    exact('Sub-queries are not allowed in a check', 'check.subQuery'),
    [
        /^The keyword (.+) is not allowed in a check$/,
        'check.keyword',
        (m) => ({ word: m[1] }),
    ],
    exact('Unbalanced parentheses: extra )', 'check.extraParen'),
    exact('Unbalanced parentheses: ( is not closed', 'check.openParen'),
    exact('Statements are not allowed in a check', 'check.statements'),
    exact('Comments are not allowed in a check', 'check.comments'),
    exact('This diagram cannot be edited', 'refusal.readOnly'),
    exact('Nothing to undo', 'refusal.nothingToUndo'),
    exact('Nothing to redo', 'refusal.nothingToRedo'),
];

const translate = (text: string): string | null => {
    const found =
        /^Found (\d+) tables? (?:and (\d+) views? )?to import\.$/.exec(text);
    if (found) {
        const tables = i18n.t(`${P}found`, { count: Number(found[1]) });
        if (!found[2]) return i18n.t(`${P}foundOnly`, { tables });
        const views = i18n.t(`${P}foundViews`, { count: Number(found[2]) });
        return i18n.t(`${P}foundWithViews`, { tables, views });
    }
    for (const [pattern, key, params] of RULES) {
        const m = pattern.exec(text);
        if (m) return i18n.t(`${P}${key}`, params?.(m) ?? {});
    }
    return null;
};

/** The wording of an engine message in the current language. */
export function diagnosticText(message: string): string {
    const lined = /^Line (\d+): ([\s\S]+)$/.exec(message);
    if (lined)
        return i18n.t(`${P}withLine`, {
            line: lined[1],
            text: translate(lined[2]) ?? lined[2],
        });
    const check = /^Invalid check on (.+?): ([\s\S]+)$/.exec(message);
    if (check)
        return i18n.t(`${P}import.invalidCheck`, {
            name: check[1],
            problem: translate(check[2]) ?? check[2],
        });
    return translate(message) ?? message;
}
