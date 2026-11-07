/**
 * Metadata queries for MySQL and MariaDB, written for this project from
 * information_schema (spec 5.2 gives the JSON shape). The JSON text is built
 * with CONCAT and GROUP_CONCAT so it runs on MySQL 5.7 as well, where the
 * JSON_ARRAYAGG function does not exist. Only the current database is read.
 */

// Every piece that is not a plain literal is made utf8mb4_bin, whatever the
// client's character set is: with a latin1 or utf8 connection, MySQL refuses to
// join a CAST(.. AS CHAR) with JSON_QUOTE's utf8mb4_bin ("Illegal mix of
// collations for operation 'concat'").
const bin = (e: string) => `CONVERT(${e} USING utf8mb4) COLLATE utf8mb4_bin`;
const q = (e: string) =>
    `IFNULL(JSON_QUOTE(CONVERT(${e} USING utf8mb4)), 'null')`;
const n = (e: string) => `IFNULL(${bin(`CAST(${e} AS CHAR)`)}, 'null')`;
const b = (cond: string) => bin(`IF(${cond}, 'true', 'false')`);
const EMPTY = `'""'`;

type Pair = [key: string, value: string];

const row = (pairs: Pair[]) =>
    `CONCAT('{', ${pairs
        .map(([k, v], i) => `'${i ? ',' : ''}"${k}":', ${v}`)
        .join(', ')}, '}')`;

const array = (key: string, pairs: Pair[], from: string) =>
    `'"${key}":', IFNULL(CONCAT('[', (SELECT GROUP_CONCAT(${row(pairs)} SEPARATOR ',')
    FROM ${from}), ']'), '[]')`;

const IS = 'information_schema';

// MySQL stores a check clause with escaped quotes (\') and a character set
// introducer before each string (_utf8mb4'..'); neither belongs in the rule text.
// CHAR(92) and CHAR(39) are the backslash and the quote, whatever sql_mode says.
const CHARSETS = ['utf8mb4', 'utf8mb3', 'utf8', 'latin1', 'ascii', 'binary'];
const cleanClause = (e: string) =>
    CHARSETS.reduce(
        (acc, cs) => `REPLACE(${acc}, CONCAT('_${cs}', CHAR(39)), CHAR(39))`,
        `REPLACE(${e}, CONCAT(CHAR(92), CHAR(39)), CHAR(39))`
    );

const NUMERIC_TYPES = `'tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint', 'decimal', 'numeric', 'float', 'double', 'real', 'bit'`;

/**
 * The default as SQL text. MariaDB already gives it quoted ('new', and the
 * word NULL for none). MySQL gives a string without its quotes, so one is quoted
 * here unless it is a number or an expression (CURRENT_TIMESTAMP, DEFAULT_GENERATED).
 * A view column reports a made-up default (0, say): none is kept.
 */
const defaultOf = (c: string) => {
    const maria = `VERSION() LIKE '%MariaDB%'`;
    const raw = `${maria} OR ${c}.EXTRA LIKE '%DEFAULT\\_GENERATED%' OR ${c}.DATA_TYPE IN (${NUMERIC_TYPES}) OR ${c}.COLUMN_DEFAULT LIKE 'CURRENT\\_TIMESTAMP%'`;
    return `IF(${c}.TABLE_NAME IN (SELECT w.TABLE_NAME FROM ${IS}.VIEWS w WHERE w.TABLE_SCHEMA = DATABASE())
      OR ${c}.COLUMN_DEFAULT IS NULL OR (${maria} AND ${c}.COLUMN_DEFAULT = 'NULL'), NULL,
      IF(${raw}, ${bin(`${c}.COLUMN_DEFAULT`)}, ${bin(`QUOTE(${c}.COLUMN_DEFAULT)`)}))`;
};

function mysqlScript(withChecks: boolean): string {
    const sections = [
        array(
            'tables',
            [
                ['schema', EMPTY],
                ['table', q('t.TABLE_NAME')],
                ['rows', n('t.TABLE_ROWS')],
                ['type', `'"BASE TABLE"'`],
                ['engine', q('t.ENGINE')],
                ['collation', q('t.TABLE_COLLATION')],
                ['comment', q(`NULLIF(t.TABLE_COMMENT, '')`)],
            ],
            `${IS}.TABLES t
    WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_TYPE = 'BASE TABLE'`
        ),
        array(
            'views',
            [
                ['schema', EMPTY],
                ['view_name', q('v.TABLE_NAME')],
                [
                    'view_definition',
                    q(
                        `REPLACE(TO_BASE64(CONVERT(v.VIEW_DEFINITION USING utf8mb4)), CHAR(10 USING utf8mb4), '')`
                    ),
                ],
            ],
            `${IS}.VIEWS v WHERE v.TABLE_SCHEMA = DATABASE()`
        ),
        array(
            'columns',
            [
                ['schema', EMPTY],
                ['table', q('c.TABLE_NAME')],
                ['name', q('c.COLUMN_NAME')],
                ['type', q('c.DATA_TYPE')],
                ['ordinal_position', n('c.ORDINAL_POSITION')],
                ['nullable', b(`c.IS_NULLABLE = 'YES'`)],
                [
                    'character_maximum_length',
                    q(
                        `CASE WHEN c.DATA_TYPE IN ('char', 'varchar', 'binary', 'varbinary') THEN CAST(c.CHARACTER_MAXIMUM_LENGTH AS CHAR) END`
                    ),
                ],
                [
                    'precision',
                    `IF(c.DATA_TYPE IN ('decimal', 'numeric'), ${bin(`CONCAT('{"precision":', c.NUMERIC_PRECISION, ',"scale":', IFNULL(c.NUMERIC_SCALE, 0), '}')`)}, 'null')`,
                ],
                ['default', q(defaultOf('c'))],
                ['collation', q('c.COLLATION_NAME')],
                ['comment', q(`NULLIF(c.COLUMN_COMMENT, '')`)],
                ['is_identity', b(`c.EXTRA LIKE '%auto_increment%'`)],
            ],
            `${IS}.COLUMNS c WHERE c.TABLE_SCHEMA = DATABASE()`
        ),
        array(
            'pk_info',
            [
                ['schema', EMPTY],
                ['table', q('s.TABLE_NAME')],
                ['column', q('s.COLUMN_NAME')],
                ['pk_def', `'"PRIMARY KEY"'`],
            ],
            `${IS}.STATISTICS s
    WHERE s.TABLE_SCHEMA = DATABASE() AND s.INDEX_NAME = 'PRIMARY'`
        ),
        array(
            'fk_info',
            [
                ['schema', EMPTY],
                ['table', q('k.TABLE_NAME')],
                ['column', q('k.COLUMN_NAME')],
                ['foreign_key_name', q('k.CONSTRAINT_NAME')],
                ['reference_schema', EMPTY],
                ['reference_table', q('k.REFERENCED_TABLE_NAME')],
                ['reference_column', q('k.REFERENCED_COLUMN_NAME')],
                ['fk_def', `'"FOREIGN KEY"'`],
            ],
            `${IS}.KEY_COLUMN_USAGE k
    WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL`
        ),
        array(
            'indexes',
            [
                ['schema', EMPTY],
                ['table', q('s.TABLE_NAME')],
                ['name', q('s.INDEX_NAME')],
                ['column', q('s.COLUMN_NAME')],
                ['index_type', q('LOWER(s.INDEX_TYPE)')],
                ['cardinality', n('s.CARDINALITY')],
                ['unique', b('s.NON_UNIQUE = 0')],
                ['direction', q(`IF(s.COLLATION = 'D', 'desc', 'asc')`)],
                ['column_position', n('s.SEQ_IN_INDEX')],
            ],
            `${IS}.STATISTICS s
    WHERE s.TABLE_SCHEMA = DATABASE() AND s.COLUMN_NAME IS NOT NULL`
        ),
    ];
    if (withChecks)
        sections.push(
            array(
                'check_constraints',
                [
                    ['schema', EMPTY],
                    ['table', q('tc.TABLE_NAME')],
                    ['expression', q(cleanClause('cc.CHECK_CLAUSE'))],
                ],
                `${IS}.CHECK_CONSTRAINTS cc
    JOIN ${IS}.TABLE_CONSTRAINTS tc
      ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA
      AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
      AND tc.CONSTRAINT_TYPE = 'CHECK'
    WHERE cc.CONSTRAINT_SCHEMA = DATABASE()`
            )
        );

    return `SET SESSION group_concat_max_len = 4294967295;
SELECT CONCAT(
  '{"database_name":', ${q('DATABASE()')},
  ',"version":', ${q('VERSION()')},
  ',', ${sections.join(",\n  ',', ")},
  '}') AS metadata_json_to_import;`;
}

/** MySQL 8 and MariaDB: with check constraints. */
export const MYSQL_SCRIPT = mysqlScript(true);
/** MySQL 5.7: check constraints are not kept there, so none are read. */
export const MYSQL_57_SCRIPT = mysqlScript(false);
