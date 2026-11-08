/**
 * Metadata query for Oracle (Database 12.2 and later), written for this
 * project from the USER_* dictionary views (spec 5.2 gives the JSON shape).
 * It reads the connected user's own schema and returns one JSON cell.
 *
 * Left out, because the dictionary keeps them in LONG columns that SQL cannot
 * aggregate: column default values, view definitions and check conditions.
 * Not yet run against a live Oracle server (see rewrite/decisions-phase9-restore.md).
 */
export const ORACLE_SCRIPT = `SELECT JSON_OBJECT(
  'database_name' VALUE SYS_CONTEXT('USERENV', 'DB_NAME'),
  'version' VALUE (SELECT version FROM product_component_version WHERE ROWNUM = 1),
  'tables' VALUE NVL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'schema' VALUE USER,
        'table' VALUE t.table_name,
        'rows' VALUE t.num_rows,
        'type' VALUE 'BASE TABLE',
        'comment' VALUE tc.comments) RETURNING CLOB)
      FROM user_tables t
      LEFT JOIN user_tab_comments tc ON tc.table_name = t.table_name
      WHERE t.nested = 'NO'), '[]') FORMAT JSON,
  'views' VALUE NVL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'schema' VALUE USER,
        'view_name' VALUE v.view_name) RETURNING CLOB)
      FROM user_views v), '[]') FORMAT JSON,
  'columns' VALUE NVL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'schema' VALUE USER,
        'table' VALUE c.table_name,
        'name' VALUE c.column_name,
        'type' VALUE LOWER(REGEXP_REPLACE(c.data_type, '\\(\\d+\\)', '')),
        'ordinal_position' VALUE c.column_id,
        'nullable' VALUE CASE WHEN c.nullable = 'Y' THEN 'true' ELSE 'false' END FORMAT JSON,
        'character_maximum_length' VALUE CASE
            WHEN c.data_type IN ('VARCHAR2', 'NVARCHAR2', 'CHAR', 'NCHAR') THEN TO_CHAR(c.char_length)
            WHEN c.data_type = 'RAW' THEN TO_CHAR(c.data_length) END,
        'precision' VALUE CASE WHEN c.data_precision IS NOT NULL THEN
            JSON_OBJECT('precision' VALUE c.data_precision, 'scale' VALUE c.data_scale) END FORMAT JSON,
        'comment' VALUE cc.comments,
        'is_identity' VALUE CASE WHEN i.column_name IS NOT NULL THEN 'true' ELSE 'false' END FORMAT JSON)
        ORDER BY c.table_name, c.column_id RETURNING CLOB)
      FROM user_tab_columns c
      LEFT JOIN user_col_comments cc
        ON cc.table_name = c.table_name AND cc.column_name = c.column_name
      LEFT JOIN user_tab_identity_cols i
        ON i.table_name = c.table_name AND i.column_name = c.column_name), '[]') FORMAT JSON,
  'pk_info' VALUE NVL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'schema' VALUE USER,
        'table' VALUE k.table_name,
        'column' VALUE k.column_name,
        'pk_def' VALUE 'PRIMARY KEY') RETURNING CLOB)
      FROM user_constraints n
      JOIN user_cons_columns k ON k.constraint_name = n.constraint_name
      WHERE n.constraint_type = 'P'), '[]') FORMAT JSON,
  'fk_info' VALUE NVL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'schema' VALUE USER,
        'table' VALUE k.table_name,
        'column' VALUE k.column_name,
        'foreign_key_name' VALUE n.constraint_name,
        'reference_schema' VALUE r.owner,
        'reference_table' VALUE r.table_name,
        'reference_column' VALUE r.column_name,
        'fk_def' VALUE 'FOREIGN KEY') RETURNING CLOB)
      FROM user_constraints n
      JOIN user_cons_columns k ON k.constraint_name = n.constraint_name
      JOIN all_cons_columns r
        ON r.owner = n.r_owner AND r.constraint_name = n.r_constraint_name
        AND r.position = k.position
      WHERE n.constraint_type = 'R'), '[]') FORMAT JSON,
  'indexes' VALUE NVL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'schema' VALUE USER,
        'table' VALUE i.table_name,
        'name' VALUE i.index_name,
        'column' VALUE c.column_name,
        'index_type' VALUE CASE WHEN i.index_type = 'BITMAP' THEN 'bitmap' ELSE 'btree' END,
        'unique' VALUE CASE WHEN i.uniqueness = 'UNIQUE' THEN 'true' ELSE 'false' END FORMAT JSON,
        'direction' VALUE LOWER(c.descend),
        'column_position' VALUE c.column_position) RETURNING CLOB)
      FROM user_indexes i
      JOIN user_ind_columns c ON c.index_name = i.index_name
      WHERE i.index_type IN ('NORMAL', 'BITMAP')), '[]') FORMAT JSON
  RETURNING CLOB) AS metadata_json_to_import
FROM dual;`;
