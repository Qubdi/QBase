import type { DatabaseEdition, DatabaseType } from '@/core/model/database';
import { MYSQL_57_SCRIPT, MYSQL_SCRIPT } from './scripts/mysql';
import { ORACLE_SCRIPT } from './scripts/oracle';
import {
    POSTGRES_SCRIPT,
    SUPABASE_SCRIPT,
    TIMESCALE_SCRIPT,
} from './scripts/postgresql';
import {
    SQL_SERVER_2016_SCRIPT,
    SQL_SERVER_SCRIPT,
} from './scripts/sql-server';

/**
 * SQLite: tables, views, columns, keys, foreign keys and indexes from the
 * `pragma_*` table functions, as one JSON cell (spec 5.2). Written for this
 * project and checked against a real SQLite in the tests. Views carry no
 * definition, because SQLite has no base64 function; checks are not listed.
 * An index keeps its sort direction and the WHERE text of a partial index. A
 * generated column is listed with its type but without its expression (the
 * pragma does not give it).
 */
const SQLITE_SCRIPT = `SELECT json_object(
  'database_name', 'main',
  'version', 'SQLite ' || sqlite_version(),
  'tables', json((SELECT json_group_array(json_object(
      'schema', '', 'table', m.name, 'type', 'BASE TABLE'))
    FROM sqlite_master m
    WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite\\_%' ESCAPE '\\')),
  'views', json((SELECT json_group_array(json_object(
      'schema', '', 'view_name', m.name))
    FROM sqlite_master m WHERE m.type = 'view')),
  'columns', json((SELECT json_group_array(json_object(
      'schema', '', 'table', m.name, 'name', p.name,
      'type', lower(trim(CASE WHEN instr(p.type, '(') > 0
          THEN substr(p.type, 1, instr(p.type, '(') - 1) ELSE p.type END)),
      'ordinal_position', p.cid + 1,
      'nullable', json(CASE WHEN p."notnull" = 0 THEN 'true' ELSE 'false' END),
      'character_maximum_length', CASE
          WHEN instr(p.type, '(') > 0 AND instr(p.type, ',') = 0
          THEN trim(substr(p.type, instr(p.type, '(') + 1,
              instr(p.type, ')') - instr(p.type, '(') - 1)) END,
      'precision', CASE WHEN instr(p.type, ',') > 0 THEN json_object(
          'precision', cast(trim(substr(p.type, instr(p.type, '(') + 1,
              instr(p.type, ',') - instr(p.type, '(') - 1)) AS integer),
          'scale', cast(trim(substr(p.type, instr(p.type, ',') + 1,
              instr(p.type, ')') - instr(p.type, ',') - 1)) AS integer)) END,
      'default', p.dflt_value,
      'is_identity', json(CASE WHEN p.pk = 1 AND upper(p.type) = 'INTEGER'
          THEN 'true' ELSE 'false' END)))
    FROM sqlite_master m, pragma_table_xinfo(m.name) p
    WHERE m.type IN ('table', 'view') AND m.name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
      AND p.hidden IN (0, 2, 3))),
  'pk_info', json((SELECT json_group_array(json_object(
      'schema', '', 'table', m.name, 'column', p.name,
      'pk_def', 'PRIMARY KEY'))
    FROM sqlite_master m, pragma_table_info(m.name) p
    WHERE m.type = 'table' AND p.pk > 0)),
  'fk_info', json((SELECT json_group_array(json_object(
      'schema', '', 'table', m.name, 'column', f."from",
      'foreign_key_name', 'fk_' || m.name || '_' || f.id,
      'reference_schema', '', 'reference_table', f."table",
      'reference_column', coalesce(f."to", (
          SELECT r.name FROM pragma_table_info(f."table") r
          WHERE r.pk = f.seq + 1)),
      'fk_def', 'FOREIGN KEY'))
    FROM sqlite_master m, pragma_foreign_key_list(m.name) f
    WHERE m.type = 'table')),
  'indexes', json((SELECT json_group_array(json_object(
      'schema', '', 'table', m.name, 'name', i.name, 'column', c.name,
      'index_type', 'btree', 'unique', json(CASE WHEN i."unique" = 1
          THEN 'true' ELSE 'false' END),
      'primary', json(CASE WHEN i.origin = 'pk'
          THEN 'true' ELSE 'false' END),
      'direction', CASE WHEN c."desc" = 1 THEN 'desc' ELSE 'asc' END,
      'column_position', c.seqno + 1,
      'where', CASE WHEN i.partial = 1 THEN (
          SELECT trim(substr(x.sql, instr(upper(x.sql), ' WHERE ') + 7))
          FROM sqlite_master x WHERE x.type = 'index' AND x.name = i.name) END))
    FROM sqlite_master m, pragma_index_list(m.name) i,
      pragma_index_xinfo(i.name) c
    WHERE m.type = 'table' AND c."key" = 1 AND c.name IS NOT NULL))
) AS metadata_json_to_import;`;

/**
 * Cloudflare D1 keeps its own bookkeeping tables (`_cf_*`) next to the user's
 * tables; the same query, with those left out.
 */
const D1_HIDDEN = `m.name NOT LIKE '\\_cf\\_%' ESCAPE '\\'`;
const SQLITE_D1_SCRIPT = SQLITE_SCRIPT.replaceAll(
    `m.name NOT LIKE 'sqlite\\_%' ESCAPE '\\'`,
    `m.name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND ${D1_HIDDEN}`
).replaceAll(`m.type = 'table'`, `m.type = 'table' AND ${D1_HIDDEN}`);

const SCRIPTS: Partial<Record<DatabaseType, string>> = {
    sqlite: SQLITE_SCRIPT,
    postgresql: POSTGRES_SCRIPT,
    mysql: MYSQL_SCRIPT,
    mariadb: MYSQL_SCRIPT,
    sql_server: SQL_SERVER_SCRIPT,
    oracle: ORACLE_SCRIPT,
};

const EDITION_SCRIPTS: Partial<
    Record<DatabaseType, Partial<Record<DatabaseEdition, string>>>
> = {
    postgresql: { supabase: SUPABASE_SCRIPT, timescale: TIMESCALE_SCRIPT },
    mysql: { mysql_5_7: MYSQL_57_SCRIPT },
    sql_server: { sql_server_2016_and_below: SQL_SERVER_2016_SCRIPT },
    sqlite: { cloudflare_d1: SQLITE_D1_SCRIPT },
};

/**
 * The script for a database and edition, or undefined when none is shipped.
 * An edition without its own script falls back to the standard one.
 */
export function metadataScriptFor(
    type: DatabaseType,
    edition?: DatabaseEdition
): string | undefined {
    return (edition && EDITION_SCRIPTS[type]?.[edition]) || SCRIPTS[type];
}
