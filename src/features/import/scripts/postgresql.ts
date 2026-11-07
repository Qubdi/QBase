/**
 * Metadata queries for PostgreSQL and its relatives. Written for this project
 * from the pg_catalog system tables (spec 5.2 gives the JSON shape). Each
 * query returns one text cell named `metadata_json_to_import`.
 */

export interface PostgresOptions {
    /** CockroachDB: pg_catalog without the PostgreSQL-only columns */
    cockroach?: boolean;
    /** schemas that belong to the platform, not to the user */
    hiddenSchemas?: string[];
    /** regular expressions for more such schemas */
    hiddenPatterns?: string[];
}

const SUPABASE_SCHEMAS = [
    'auth',
    'storage',
    'realtime',
    'vault',
    'graphql',
    'graphql_public',
    'extensions',
    'pgsodium',
    'pgsodium_masks',
    'supabase_functions',
    'supabase_migrations',
    'net',
    'pgbouncer',
    '_realtime',
    '_analytics',
    'cron',
    'pgtle',
];

const list = (names: string[]) => names.map((n) => `'${n}'`).join(', ');

export function postgresScript(options: PostgresOptions = {}): string {
    const cockroach = options.cockroach === true;
    const hidden = [
        'information_schema',
        ...(cockroach ? ['crdb_internal', 'pg_extension'] : []),
        ...(options.hiddenSchemas ?? []),
    ];
    const patterns = ['^pg_', ...(options.hiddenPatterns ?? [])];
    const keep = (ns: string) =>
        `${ns}.nspname NOT IN (${list(hidden)})` +
        patterns.map((p) => ` AND ${ns}.nspname !~ '${p}'`).join('');
    const F = keep('n');
    // a partition child is shown through its parent
    const notChild = cockroach ? 'true' : 'NOT c.relispartition';
    const defaultText = `pg_get_expr(ad.adbin, ad.adrelid)`;
    const isIdentity = cockroach
        ? `COALESCE(${defaultText} LIKE 'nextval(%' OR ${defaultText} LIKE 'unique_rowid()%', false)`
        : `(a.attidentity IN ('a', 'd') OR COALESCE(${defaultText} LIKE 'nextval(%', false))`;
    const collation = cockroach
        ? 'NULL'
        : `CASE WHEN a.attcollation <> t.typcollation THEN co.collname END`;
    const direction = cockroach
        ? `'asc'`
        : `CASE WHEN pg_index_column_has_property(i.indexrelid, g.k, 'desc') THEN 'desc' ELSE 'asc' END`;
    const keyColumns = cockroach ? 'i.indnatts' : 'i.indnkeyatts';
    const composites = cockroach
        ? ''
        : `
      UNION ALL
      SELECT json_build_object('schema', n.nspname, 'type', t.typname,
          'kind', 'composite',
          'fields', (SELECT json_agg(json_build_object('field', a.attname,
              'type', format_type(a.atttypid, a.atttypmod)) ORDER BY a.attnum)
            FROM pg_attribute a
            WHERE a.attrelid = t.typrelid AND a.attnum > 0 AND NOT a.attisdropped))
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_class tc ON tc.oid = t.typrelid AND tc.relkind = 'c'
      WHERE t.typtype = 'c' AND ${F}`;

    return `SELECT json_build_object(
  'database_name', current_database(),
  'version', version(),
  'tables', COALESCE((SELECT json_agg(json_build_object(
      'schema', n.nspname, 'table', c.relname,
      'rows', GREATEST(c.reltuples, 0)::bigint, 'type', 'BASE TABLE',
      'comment', obj_description(c.oid, 'pg_class'))
      ORDER BY n.nspname, c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND ${notChild} AND ${F}), '[]'::json),
  'views', COALESCE((SELECT json_agg(json_build_object(
      'schema', n.nspname, 'view_name', c.relname,
      'view_definition', replace(encode(convert_to(
          CASE WHEN c.relkind = 'm' THEN 'CREATE MATERIALIZED VIEW '
              ELSE 'CREATE VIEW ' END
          || quote_ident(n.nspname) || '.' || quote_ident(c.relname)
          || ' AS ' || pg_get_viewdef(c.oid, true), 'UTF8'),
          'base64'), chr(10), ''))
      ORDER BY n.nspname, c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('v', 'm') AND ${F}), '[]'::json),
  'columns', COALESCE((SELECT json_agg(json_build_object(
      'schema', n.nspname, 'table', c.relname, 'name', a.attname,
      'type', replace(format_type(a.atttypid, NULL), '[]', ''),
      'is_array', right(format_type(a.atttypid, NULL), 2) = '[]',
      'ordinal_position', a.attnum,
      'nullable', NOT a.attnotnull,
      'character_maximum_length', CASE
          WHEN a.atttypid IN (1042, 1043) AND a.atttypmod > 4
          THEN (a.atttypmod - 4)::text END,
      'precision', CASE WHEN a.atttypid = 1700 AND a.atttypmod >= 4
          THEN json_build_object(
              'precision', ((a.atttypmod - 4) >> 16) & 65535,
              'scale', (a.atttypmod - 4) & 65535) END,
      'default', ${defaultText},
      'collation', ${collation},
      'comment', col_description(c.oid, a.attnum),
      'is_identity', ${isIdentity})
      ORDER BY n.nspname, c.relname, a.attnum)
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    LEFT JOIN pg_collation co ON co.oid = a.attcollation
    WHERE a.attnum > 0 AND NOT a.attisdropped
      AND c.relkind IN ('r', 'p', 'v', 'm') AND ${notChild} AND ${F}), '[]'::json),
  'pk_info', COALESCE((SELECT json_agg(json_build_object(
      'schema', n.nspname, 'table', c.relname, 'column', a.attname,
      'pk_def', pg_get_constraintdef(con.oid))
      ORDER BY n.nspname, c.relname, g.i)
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL generate_series(1, array_length(con.conkey, 1)) AS g(i)
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[g.i]
    WHERE con.contype = 'p' AND ${notChild} AND ${F}), '[]'::json),
  'fk_info', COALESCE((SELECT json_agg(json_build_object(
      'schema', n.nspname, 'table', c.relname, 'column', a.attname,
      'foreign_key_name', con.conname,
      'reference_schema', rn.nspname, 'reference_table', rc.relname,
      'reference_column', ra.attname,
      'fk_def', pg_get_constraintdef(con.oid))
      ORDER BY n.nspname, c.relname, con.conname, g.i)
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class rc ON rc.oid = con.confrelid
    JOIN pg_namespace rn ON rn.oid = rc.relnamespace
    CROSS JOIN LATERAL generate_series(1, array_length(con.conkey, 1)) AS g(i)
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[g.i]
    JOIN pg_attribute ra ON ra.attrelid = con.confrelid AND ra.attnum = con.confkey[g.i]
    WHERE con.contype = 'f' AND ${notChild} AND ${F}), '[]'::json),
  'indexes', COALESCE((SELECT json_agg(json_build_object(
      'schema', n.nspname, 'table', c.relname, 'name', ic.relname,
      'column', pg_get_indexdef(i.indexrelid, g.k, true),
      'index_type', am.amname, 'unique', i.indisunique,
      'direction', ${direction}, 'column_position', g.k)
      ORDER BY n.nspname, c.relname, ic.relname, g.k)
    FROM pg_index i
    JOIN pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_am am ON am.oid = ic.relam
    CROSS JOIN LATERAL generate_series(1, ${keyColumns}) AS g(k)
    WHERE c.relkind IN ('r', 'p', 'm') AND ${F}), '[]'::json),
  'check_constraints', COALESCE((SELECT json_agg(json_build_object(
      'schema', n.nspname, 'table', c.relname,
      'expression', regexp_replace(pg_get_constraintdef(con.oid),
          '^CHECK \\((.*)\\)( NOT VALID)?$', '\\1'))
      ORDER BY n.nspname, c.relname, con.conname)
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype = 'c' AND ${notChild} AND ${F}), '[]'::json),
  'custom_types', COALESCE((SELECT json_agg(x) FROM (
      SELECT json_build_object('schema', n.nspname, 'type', t.typname,
          'kind', 'enum',
          'values', (SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder)
              FROM pg_enum e WHERE e.enumtypid = t.oid)) AS x
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typtype = 'e' AND ${F}${composites}) u), '[]'::json)
)::text AS metadata_json_to_import;`;
}

export const POSTGRES_SCRIPT = postgresScript();
export const COCKROACH_SCRIPT = postgresScript({ cockroach: true });
export const SUPABASE_SCRIPT = postgresScript({
    hiddenSchemas: SUPABASE_SCHEMAS,
});
export const TIMESCALE_SCRIPT = postgresScript({
    hiddenSchemas: ['timescaledb_information', 'timescaledb_experimental'],
    hiddenPatterns: ['^_timescaledb'],
});
