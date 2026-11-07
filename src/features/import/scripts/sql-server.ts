/**
 * Metadata queries for SQL Server, written for this project from the sys.*
 * catalog views (spec 5.2 gives the JSON shape). The standard query uses
 * FOR JSON (SQL Server 2016 and later). The 2016-and-below edition builds the
 * JSON text by hand with FOR XML concatenation, so it also runs on 2012 and
 * 2014. Both read the current database and return one cell.
 */

type Kind = 'str' | 'num' | 'bool' | 'pair' | 'computed';

interface Field {
    key: string;
    expr: string;
    kind: Kind;
    /** the scale of a precision pair; the is_persisted flag of a computed column */
    expr2?: string;
}

interface Section {
    key: string;
    from: string;
    fields: Field[];
}

const str = (key: string, expr: string): Field => ({ key, expr, kind: 'str' });
const num = (key: string, expr: string): Field => ({ key, expr, kind: 'num' });
const bool = (key: string, expr: string): Field => ({
    key,
    expr,
    kind: 'bool',
});

const NOT_SYSTEM = 'is_ms_shipped = 0';

const description = (major: string, minor: string) =>
    `(SELECT CAST(ep.value AS nvarchar(4000)) FROM sys.extended_properties ep WHERE ep.class = 1 AND ep.name = N'MS_Description' AND ep.major_id = ${major} AND ep.minor_id = ${minor})`;

const SECTIONS: Section[] = [
    {
        key: 'tables',
        from: `sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE t.${NOT_SYSTEM}`,
        fields: [
            str('schema', 's.name'),
            str('table', 't.name'),
            num(
                'rows',
                `(SELECT SUM(p.rows) FROM sys.partitions p WHERE p.object_id = t.object_id AND p.index_id IN (0, 1))`
            ),
            str('type', `'BASE TABLE'`),
            str('comment', description('t.object_id', '0')),
        ],
    },
    {
        key: 'views',
        from: `sys.views v JOIN sys.schemas s ON s.schema_id = v.schema_id
    LEFT JOIN sys.sql_modules m ON m.object_id = v.object_id
    CROSS APPLY (SELECT CAST(m.definition AS varbinary(max)) AS bin) d
    WHERE v.${NOT_SYSTEM}`,
        fields: [
            str('schema', 's.name'),
            str('view_name', 'v.name'),
            str(
                'view_definition',
                `CAST('' AS xml).value('xs:base64Binary(sql:column("d.bin"))', 'varchar(max)')`
            ),
        ],
    },
    {
        key: 'columns',
        from: `sys.columns c
    JOIN sys.objects o ON o.object_id = c.object_id AND o.type IN ('U', 'V') AND o.${NOT_SYSTEM}
    JOIN sys.schemas s ON s.schema_id = o.schema_id
    JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
    LEFT JOIN sys.computed_columns cmp ON cmp.object_id = c.object_id AND cmp.column_id = c.column_id`,
        fields: [
            str('schema', 's.name'),
            str('table', 'o.name'),
            str('name', 'c.name'),
            str('type', 'ty.name'),
            num('ordinal_position', 'c.column_id'),
            bool('nullable', 'c.is_nullable'),
            str(
                'character_maximum_length',
                `CASE WHEN ty.name IN ('char', 'varchar', 'binary', 'varbinary') THEN CASE WHEN c.max_length = -1 THEN 'max' ELSE CAST(c.max_length AS varchar(10)) END WHEN ty.name IN ('nchar', 'nvarchar') THEN CASE WHEN c.max_length = -1 THEN 'max' ELSE CAST(c.max_length / 2 AS varchar(10)) END END`
            ),
            {
                key: 'precision',
                kind: 'pair',
                expr: `CASE WHEN ty.name IN ('decimal', 'numeric') THEN c.precision END`,
                expr2: `CASE WHEN ty.name IN ('decimal', 'numeric') THEN c.scale END`,
            },
            str('default', 'dc.definition'),
            str('collation', 'c.collation_name'),
            str('comment', description('c.object_id', 'c.column_id')),
            bool('is_identity', 'c.is_identity'),
            // a computed column: its expression and whether it is persisted (null for an ordinary column)
            {
                key: 'generated',
                kind: 'computed',
                expr: 'cmp.definition',
                expr2: 'cmp.is_persisted',
            },
        ],
    },
    {
        key: 'pk_info',
        from: `sys.key_constraints kc
    JOIN sys.tables t ON t.object_id = kc.parent_object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE kc.type = 'PK' AND ic.key_ordinal > 0 AND t.${NOT_SYSTEM}`,
        fields: [
            str('schema', 's.name'),
            str('table', 't.name'),
            str('column', 'c.name'),
            str('pk_def', `'PRIMARY KEY'`),
        ],
    },
    {
        key: 'fk_info',
        from: `sys.foreign_key_columns fkc
    JOIN sys.foreign_keys fk ON fk.object_id = fkc.constraint_object_id
    JOIN sys.tables t ON t.object_id = fkc.parent_object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
    JOIN sys.tables rt ON rt.object_id = fkc.referenced_object_id
    JOIN sys.schemas rs ON rs.schema_id = rt.schema_id
    JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
    WHERE t.${NOT_SYSTEM}`,
        fields: [
            str('schema', 's.name'),
            str('table', 't.name'),
            str('column', 'c.name'),
            str('foreign_key_name', 'fk.name'),
            str('reference_schema', 'rs.name'),
            str('reference_table', 'rt.name'),
            str('reference_column', 'rc.name'),
            str('fk_def', `'FOREIGN KEY'`),
        ],
    },
    {
        key: 'indexes',
        from: `sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal > 0
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.type > 0 AND i.is_hypothetical = 0 AND t.${NOT_SYSTEM}`,
        fields: [
            str('schema', 's.name'),
            str('table', 't.name'),
            str('name', 'i.name'),
            str('column', 'c.name'),
            str('index_type', 'LOWER(i.type_desc)'),
            bool('unique', 'i.is_unique'),
            str(
                'direction',
                `CASE WHEN ic.is_descending_key = 1 THEN 'desc' ELSE 'asc' END`
            ),
            num('column_position', 'ic.key_ordinal'),
            // the predicate of a filtered index (null for an ordinary one)
            str('where', 'i.filter_definition'),
        ],
    },
    {
        key: 'check_constraints',
        from: `sys.check_constraints cc
    JOIN sys.tables t ON t.object_id = cc.parent_object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE t.${NOT_SYSTEM}`,
        fields: [
            str('schema', 's.name'),
            str('table', 't.name'),
            str('expression', 'cc.definition'),
        ],
    },
];

/** Standard query: FOR JSON, SQL Server 2016 and later. */
function forJsonSelect(f: Field): string {
    switch (f.kind) {
        case 'bool':
            return `CAST(${f.expr} AS bit) AS [${f.key}]`;
        case 'pair':
            return `${f.expr} AS [${f.key}.precision], ${f.expr2} AS [${f.key}.scale]`;
        case 'computed':
            return `${f.expr} AS [${f.key}.expression], CAST(${f.expr2} AS bit) AS [${f.key}.stored]`;
        default:
            return `${f.expr} AS [${f.key}]`;
    }
}

function forJsonScript(): string {
    const parts = SECTIONS.map(
        (s) =>
            `JSON_QUERY(ISNULL((SELECT ${s.fields.map(forJsonSelect).join(', ')}
    FROM ${s.from}
    FOR JSON PATH), '[]')) AS [${s.key}]`
    );
    return `DECLARE @metadata nvarchar(max) = (SELECT
  DB_NAME() AS [database_name], @@VERSION AS [version],
  ${parts.join(',\n  ')}
  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
SELECT @metadata AS metadata_json_to_import;`;
}

/** Text escaped for a JSON string, without STRING_ESCAPE (2016 and later). */
const escaped = (e: string) =>
    `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(CAST(${e} AS nvarchar(max)), '\\', '\\\\'), '"', '\\"'), CHAR(13), '\\r'), CHAR(10), '\\n'), CHAR(9), '\\t')`;

function legacyValue(f: Field): string {
    switch (f.kind) {
        case 'str':
            return `ISNULL('"' + ${escaped(f.expr)} + '"', 'null')`;
        case 'num':
            return `ISNULL(CAST(${f.expr} AS varchar(30)), 'null')`;
        case 'bool':
            return `CASE WHEN ${f.expr} = 1 THEN 'true' WHEN ${f.expr} = 0 THEN 'false' ELSE 'null' END`;
        case 'pair':
            return `CASE WHEN ${f.expr} IS NULL THEN 'null' ELSE '{"precision":' + CAST(${f.expr} AS varchar(10)) + ',"scale":' + ISNULL(CAST(${f.expr2} AS varchar(10)), 'null') + '}' END`;
        case 'computed':
            return `CASE WHEN ${f.expr} IS NULL THEN 'null' ELSE '{"expression":"' + ${escaped(f.expr)} + '","stored":' + CASE WHEN ${f.expr2} = 1 THEN 'true' ELSE 'false' END + '}' END`;
    }
}

function legacyScript(): string {
    const parts = SECTIONS.map((s) => {
        const pairs = s.fields
            .map((f) => `'"${f.key}":' + ${legacyValue(f)}`)
            .join(` + ',' + `);
        return `',"${s.key}":' + ISNULL('[' + STUFF((SELECT ',{' + ${pairs} + '}'
    FROM ${s.from}
    FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, '') + ']', '[]')`;
    });
    return `DECLARE @metadata nvarchar(max) = N'{"database_name":' + ISNULL('"' + ${escaped('DB_NAME()')} + '"', 'null')
  + ',"version":' + ISNULL('"' + ${escaped('@@VERSION')} + '"', 'null')
  + ${parts.join('\n  + ')}
  + '}';
SELECT @metadata AS metadata_json_to_import;`;
}

export const SQL_SERVER_SCRIPT = forJsonScript();
export const SQL_SERVER_2016_SCRIPT = legacyScript();
