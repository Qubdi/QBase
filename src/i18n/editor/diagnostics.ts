// English wording for the checks and notes the import and export engines raise.
// The engines write plain English themselves (tests and the command line read
// it); the screen turns each known message into one of these texts, see
// `src/lib/diagnostic-text.ts`. Anything not listed shows as the engine wrote it.
export const diagnosticsStrings = {
    withLine: 'Line {{line}}: {{text}}',
    found_one: 'Found {{count}} table',
    found_other: 'Found {{count}} tables',
    foundViews_one: '{{count}} view',
    foundViews_other: '{{count}} views',
    foundWithViews: '{{tables}} and {{views}} to import.',
    foundOnly: '{{tables}} to import.',
    nothingToImport: 'Nothing to import',
    invalidJson:
        'Invalid JSON. Please correct it or contact us at support@qubdi.com for help.',
    nothingToExport: 'Nothing to export',
    emptyScript: 'The SQL script is empty',
    noStatements: 'No valid SQL statements found',
    addCreateTable: 'Add CREATE TABLE statements to import',
    noSemicolon: 'SQL statements should end with semicolons (;)',
    unterminatedComment: 'Unterminated block comment',
    closeComment: 'Close the comment with */',
    unterminatedText: 'Unterminated quoted text',
    closeText: 'Close the text with {{quote}}',
    unmatchedParen: 'Unmatched closing parenthesis',
    unclosedParen: 'Unclosed parenthesis',
    dialectSyntax: {
        serialMysql: 'SERIAL is not valid in MySQL, use AUTO_INCREMENT',
        identityMysql:
            'GENERATED ... AS IDENTITY is not valid in MySQL, use AUTO_INCREMENT',
        sqlServerIdentityMysql:
            'IDENTITY(a,b) is SQL Server syntax, use AUTO_INCREMENT',
        autoIncrementSqlServer:
            'AUTO_INCREMENT is MySQL syntax, use IDENTITY(1,1)',
        serialSqlServer: 'SERIAL is PostgreSQL syntax, use IDENTITY(1,1)',
        identitySqlServer:
            'GENERATED ... AS IDENTITY is not valid in SQL Server, use IDENTITY(1,1)',
        ifNotExistsSqlServer: 'CREATE TABLE IF NOT EXISTS is not valid T-SQL',
        schemaSqlite: 'CREATE SCHEMA is not supported in SQLite',
        removeSchemaSqlite: 'Remove schema creation statements for SQLite',
        enumSqlite: 'ENUM is not supported in SQLite, use a CHECK constraint',
        autoIncrementSqlite:
            'AUTO_INCREMENT is MySQL syntax, use AUTOINCREMENT',
        serialSqlite:
            'SERIAL is PostgreSQL syntax, use INTEGER PRIMARY KEY AUTOINCREMENT',
        identitySqlite:
            'GENERATED ... AS IDENTITY is not valid in SQLite, use AUTOINCREMENT',
        sqlServerIdentitySqlite:
            'IDENTITY(a,b) is SQL Server syntax, use AUTOINCREMENT',
        inlineReferencesMysql:
            'MySQL does not support inline REFERENCES in column definitions (line {{line}}). Use FOREIGN KEY constraints instead:',
    },
    postgres: {
        brokenCast:
            'Invalid cast operator ": :" found. PostgreSQL uses "::" for type casting.',
        fixCast: 'Replace ": :" with "::"',
        splitDecimal:
            'The DECIMAL type is split across lines. This may cause parsing errors.',
        fixDecimal: 'Put the precision and scale on one line',
        extension:
            'CREATE EXTENSION found. These will be skipped during import.',
        functions:
            'Function definitions found. These will be skipped during import.',
        triggers: 'Trigger definitions found. These will not be imported.',
        large: 'Large SQL file detected ({{count}} statements). Import may take some time.',
        postgis:
            'PostGIS geographic types detected. These will be imported but may not display geometric data.',
    },
    import: {
        viewNoColumns:
            'View {{name}} has no columns that can be read from its definition.',
        skipped_one: '{{count}} {{kind}} statement skipped: not imported.',
        skipped_other: '{{count}} {{kind}} statements skipped: not imported.',
        linkTableMissing:
            'Foreign key on {{table}} dropped: table {{ref}} is not in the script.',
        linkColumnsMismatch:
            'Foreign key on {{table}} dropped: its columns do not match.',
        linkNamedMissing:
            'Foreign key {{name}} dropped: a table or column is missing.',
        rowsDropped_one:
            '{{count}} foreign key row dropped: a table or column is not in the import.',
        rowsDropped_other:
            '{{count}} foreign key rows dropped: a table or column is not in the import.',
        unsupportedType: 'Unsupported database type',
        invalidDbml: 'Invalid DBML',
        invalidRelationship: 'Invalid relationship: tables or fields not found',
        manyToMany:
            'Many-to-many references (<>) are not supported: "{{left}}" and "{{right}}". Add a junction table that references both.',
        missingIndexColumn: 'Index references non-existent column: {{name}}',
        invalidCheck: 'Invalid check on {{name}}: {{problem}}',
        arrayType:
            'Array types are not supported for {{dialect}} database. Field "{{field}}" has array type "{{type}}" which is not allowed.',
    },
    export: {
        lostFields_one: 'Table {{name}} lost {{count}} field without a name.',
        lostFields_other:
            'Table {{name}} lost {{count}} fields without a name.',
        leftOutDuplicate:
            'Table {{name}} was left out: another table has the same name.',
        leftOutEmpty: 'Table {{name}} was left out: it has no fields.',
        notSupportedFor: 'SQL export is not supported for {{label}}',
        notSupportedForDiagrams:
            'SQL export is not supported for {{label}} diagrams',
        conversion: 'Conversion to {{label}} is not supported',
    },
    check: {
        empty: 'The expression is empty',
        subQuery: 'Sub-queries are not allowed in a check',
        keyword: 'The keyword {{word}} is not allowed in a check',
        extraParen: 'Unbalanced parentheses: extra )',
        openParen: 'Unbalanced parentheses: ( is not closed',
        statements: 'Statements are not allowed in a check',
        comments: 'Comments are not allowed in a check',
    },
    refusal: {
        readOnly: 'This diagram cannot be edited',
        nothingToUndo: 'Nothing to undo',
        nothingToRedo: 'Nothing to redo',
    },
};
