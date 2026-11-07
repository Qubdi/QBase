/**
 * Metadata queries for MySQL and MariaDB, written for this project from
 * information_schema (spec 5.2 gives the JSON shape). The JSON text is built
 * with CONCAT and GROUP_CONCAT so it runs on MySQL 5.7 as well, where the
 * JSON_ARRAYAGG function does not exist. Only the current database is read.
 */

const q = (e: string) =>
    `IFNULL(JSON_QUOTE(CONVERT(${e} USING utf8mb4)), 'null')`;
const n = (e: string) => `IFNULL(CAST(${e} AS CHAR), 'null')`;
const b = (cond: string) => `IF(${cond}, 'true', 'false')`;
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
                    `IF(c.DATA_TYPE IN ('decimal', 'numeric'), CONCAT('{"precision":', c.NUMERIC_PRECISION, ',"scale":', IFNULL(c.NUMERIC_SCALE, 0), '}'), 'null')`,
                ],
                ['default', q(`NULLIF(c.COLUMN_DEFAULT, 'NULL')`)],
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
                    ['expression', q('cc.CHECK_CLAUSE')],
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
