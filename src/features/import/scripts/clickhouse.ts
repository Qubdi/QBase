/**
 * Metadata query for ClickHouse, written for this project from the `system`
 * tables (spec 5.2 gives the JSON shape). It reads the current database and
 * returns one JSON cell. Named tuples become JSON objects. The columns of the
 * primary key (the sorting key) are reported as the primary key; ClickHouse has
 * no foreign keys, and its skipping indexes are not listed.
 * Not yet run against a live ClickHouse server (see rewrite/decisions-phase9-restore.md).
 */
export const CLICKHOUSE_SCRIPT = `WITH
  replaceRegexpOne(type, '^LowCardinality\\\\((.*)\\\\)$', '\\\\1') AS plain,
  replaceRegexpOne(plain, '^Nullable\\\\((.*)\\\\)$', '\\\\1') AS inner
SELECT toJSONString(CAST((
  currentDatabase(),
  version(),
  (SELECT groupArray(CAST((database, name, total_rows, 'BASE TABLE', engine, nullIf(comment, '')),
        'Tuple(schema String, "table" String, rows Nullable(UInt64), type String, engine String, comment Nullable(String))'))
    FROM system.tables
    WHERE database = currentDatabase() AND NOT is_temporary AND engine NOT LIKE '%View'),
  (SELECT groupArray(CAST((database, name, base64Encode(as_select)),
        'Tuple(schema String, view_name String, view_definition String)'))
    FROM system.tables
    WHERE database = currentDatabase() AND engine LIKE '%View'),
  (SELECT groupArray(CAST((
        database, "table", name,
        extract(inner, '^[A-Za-z0-9_]+'),
        position,
        startsWith(plain, 'Nullable('),
        if(startsWith(inner, 'FixedString('), toString(extract(inner, '\\\\d+')), NULL),
        if(startsWith(inner, 'Decimal('),
            CAST((toUInt32OrNull(extract(inner, '\\\\((\\\\d+)')), toUInt32OrNull(extract(inner, ',\\\\s*(\\\\d+)'))),
                'Tuple(precision Nullable(UInt32), scale Nullable(UInt32))'),
            CAST((NULL, NULL), 'Tuple(precision Nullable(UInt32), scale Nullable(UInt32))')),
        nullIf(default_expression, ''),
        nullIf(comment, ''),
        false),
        'Tuple(schema String, "table" String, name String, type String, ordinal_position UInt64, nullable Bool, character_maximum_length Nullable(String), precision Tuple(precision Nullable(UInt32), scale Nullable(UInt32)), default Nullable(String), comment Nullable(String), is_identity Bool)'))
    FROM (SELECT * FROM system.columns WHERE database = currentDatabase() ORDER BY "table", position)),
  (SELECT groupArray(CAST((database, "table", name, 'PRIMARY KEY'),
        'Tuple(schema String, "table" String, "column" String, pk_def String)'))
    FROM system.columns WHERE database = currentDatabase() AND is_in_primary_key),
  [],
  []
), 'Tuple(database_name String, version String, tables Array(Tuple(schema String, "table" String, rows Nullable(UInt64), type String, engine String, comment Nullable(String))), views Array(Tuple(schema String, view_name String, view_definition String)), columns Array(Tuple(schema String, "table" String, name String, type String, ordinal_position UInt64, nullable Bool, character_maximum_length Nullable(String), precision Tuple(precision Nullable(UInt32), scale Nullable(UInt32)), default Nullable(String), comment Nullable(String), is_identity Bool)), pk_info Array(Tuple(schema String, "table" String, "column" String, pk_def String)), fk_info Array(String), indexes Array(String))'))
  AS metadata_json_to_import;`;
