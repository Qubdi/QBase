import net, { isIP } from 'node:net';
import pg from 'pg';
import { limitReceivedBytes, MAX_RESPONSE_BYTES } from './byte-budget.js';
import { assertReadOnlySql } from './readonly-guard.js';
import type { ResolvedTarget } from './net-guard.js';
import { decodeTypmod, splitArrayType } from './typmod.js';
import {
    STATEMENT_TIMEOUT_MS,
    encodeViewDefinition,
    type CatalogSchema,
    type ConnectionParams,
    type DatabaseMetadata,
    type IntrospectOptions,
    type Introspector,
} from './types.js';

// $1 is always the schema filter (text[]); an empty array means "all user schemas".
const USER_SCHEMA = (alias: string) => `
    ${alias}.nspname NOT IN ('pg_catalog', 'information_schema')
    AND ${alias}.nspname NOT LIKE 'pg\\_toast%'
    AND ${alias}.nspname NOT LIKE 'pg\\_temp%'
    AND (cardinality($1::text[]) = 0 OR ${alias}.nspname = ANY($1::text[]))`;

export const POSTGRES_QUERIES = {
    server: `SELECT current_database() AS database_name, version() AS version`,

    tables: `
        SELECT n.nspname AS schema, c.relname AS "table",
               GREATEST(c.reltuples, 0)::bigint AS rows,
               'BASE TABLE' AS type,
               obj_description(c.oid, 'pg_class') AS comment
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p', 'f') AND NOT c.relispartition AND ${USER_SCHEMA('n')}
        ORDER BY n.nspname, c.relname`,

    views: `
        SELECT n.nspname AS schema, c.relname AS view_name,
               format('%I.%I', n.nspname, c.relname) AS qualified_name,
               c.relkind = 'm' AS materialized,
               pg_get_viewdef(c.oid, true) AS view_definition
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('v', 'm') AND ${USER_SCHEMA('n')}
        ORDER BY n.nspname, c.relname`,

    columns: `
        SELECT n.nspname AS schema, c.relname AS "table", a.attname AS name,
               pg_catalog.format_type(
                   CASE WHEN t.typtype = 'd' THEN t.typbasetype ELSE a.atttypid END, NULL) AS type,
               CASE WHEN t.typtype = 'd' AND a.atttypmod = -1
                    THEN t.typtypmod ELSE a.atttypmod END AS typmod,
               CASE WHEN t.typtype = 'd' THEN t.typname END AS domain,
               a.attnum AS ordinal_position,
               NOT a.attnotnull AS nullable,
               CASE WHEN a.attgenerated IN ('s', 'v') THEN NULL
                    ELSE pg_get_expr(d.adbin, d.adrelid) END AS "default",
               CASE WHEN a.attgenerated IN ('s', 'v')
                    THEN pg_get_expr(d.adbin, d.adrelid) END AS generated_expression,
               a.attgenerated = 's' AS generated_stored,
               col_description(c.oid, a.attnum) AS comment,
               (a.attidentity <> '' OR pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval(%') AS is_identity,
               co.collname AS collation
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_type t ON t.oid = a.atttypid
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        LEFT JOIN pg_collation co ON co.oid = a.attcollation AND a.attcollation <> t.typcollation
        WHERE a.attnum > 0 AND NOT a.attisdropped
          AND c.relkind IN ('r', 'p', 'f', 'v', 'm') AND NOT c.relispartition AND ${USER_SCHEMA('n')}
        ORDER BY n.nspname, c.relname, a.attnum`,

    primaryKeys: `
        SELECT n.nspname AS schema, c.relname AS "table", a.attname AS "column",
               pg_get_constraintdef(con.oid) AS pk_def
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
        WHERE con.contype = 'p' AND NOT c.relispartition AND ${USER_SCHEMA('n')}
        ORDER BY n.nspname, c.relname, k.ord`,

    foreignKeys: `
        SELECT n.nspname AS schema, c.relname AS "table", a.attname AS "column",
               con.conname AS foreign_key_name,
               fn.nspname AS reference_schema, fc.relname AS reference_table,
               fa.attname AS reference_column,
               pg_get_constraintdef(con.oid) AS fk_def
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_class fc ON fc.oid = con.confrelid
        JOIN pg_namespace fn ON fn.oid = fc.relnamespace
        CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(attnum, fattnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
        JOIN pg_attribute fa ON fa.attrelid = fc.oid AND fa.attnum = k.fattnum
        WHERE con.contype = 'f' AND NOT c.relispartition AND con.conparentid = 0
          AND ${USER_SCHEMA('n')}
        ORDER BY n.nspname, c.relname, con.conname, k.ord`,

    indexes: `
        SELECT n.nspname AS schema, t.relname AS "table", i.relname AS name,
               COALESCE(a.attname, pg_get_indexdef(ix.indexrelid, k.pos::int, true)) AS "column",
               am.amname AS index_type, ix.indisunique AS "unique", ix.indisprimary AS "primary",
               pg_get_expr(ix.indpred, ix.indrelid) AS "where",
               CASE WHEN (ix.indoption[k.pos - 1] & 1) = 1 THEN 'DESC' ELSE 'ASC' END AS direction,
               k.pos AS column_position
        FROM pg_index ix
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_am am ON am.oid = i.relam
        CROSS JOIN LATERAL generate_series(1, ix.indnkeyatts) AS k(pos)
        LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ix.indkey[k.pos - 1]
        WHERE t.relkind IN ('r', 'p', 'm') AND NOT t.relispartition AND ix.indisvalid
          AND ${USER_SCHEMA('n')}
        ORDER BY n.nspname, t.relname, i.relname, k.pos`,

    checks: `
        SELECT n.nspname AS schema, c.relname AS "table",
               regexp_replace(pg_get_constraintdef(con.oid),
                   '^CHECK \\((.*)\\)( NOT VALID)?$', '\\1') AS expression
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE con.contype = 'c' AND NOT c.relispartition AND ${USER_SCHEMA('n')}
        ORDER BY n.nspname, c.relname, con.conname`,

    composites: `
        SELECT n.nspname AS schema, t.typname AS type,
               json_agg(json_build_object('field', a.attname,
                   'type', format_type(a.atttypid, a.atttypmod))
                   ORDER BY a.attnum) AS fields
        FROM pg_type t
        JOIN pg_class tc ON tc.oid = t.typrelid AND tc.relkind = 'c'
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_attribute a ON a.attrelid = t.typrelid AND a.attnum > 0 AND NOT a.attisdropped
        WHERE t.typtype = 'c' AND ${USER_SCHEMA('n')}
        GROUP BY n.nspname, t.typname
        ORDER BY n.nspname, t.typname`,

    enums: `
        SELECT n.nspname AS schema, t.typname AS type,
               array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS values
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE ${USER_SCHEMA('n')}
        GROUP BY n.nspname, t.typname
        ORDER BY n.nspname, t.typname`,
} as const;

const num = (v: unknown): number | undefined =>
    v === null || v === undefined ? undefined : Number(v);

/**
 * Runs `fn` inside a READ ONLY transaction with a statement timeout, then
 * always rolls back. PostgreSQL itself rejects any write attempted inside it.
 */
export async function withReadOnlyTransaction<T>(
    client: pg.ClientBase,
    fn: () => Promise<T>
): Promise<T> {
    await client.query('BEGIN READ ONLY');
    try {
        await client.query(
            `SET LOCAL statement_timeout = ${Number(STATEMENT_TIMEOUT_MS)}`
        );
        return await fn();
    } finally {
        await client.query('ROLLBACK').catch(() => undefined);
    }
}

type Row = Record<string, unknown>;

export class PostgresIntrospector implements Introspector {
    constructor(private readonly client: pg.Client) {}

    private async query(sql: string, schemas: string[]): Promise<Row[]> {
        assertReadOnlySql(sql);
        const hasFilter = sql.includes('$1');
        const res = await this.client.query(sql, hasFilter ? [schemas] : []);
        return res.rows;
    }

    async catalog(): Promise<CatalogSchema[]> {
        return withReadOnlyTransaction(this.client, async () => {
            const [tables, views] = await Promise.all([
                this.query(POSTGRES_QUERIES.tables, []),
                this.query(POSTGRES_QUERIES.views, []),
            ]);
            const bySchema = new Map<string, CatalogSchema>();
            const entry = (schema: string) => {
                let e = bySchema.get(schema);
                if (!e) {
                    e = { schema, tables: [], views: [] };
                    bySchema.set(schema, e);
                }
                return e;
            };
            for (const t of tables) entry(String(t.schema)).tables.push(String(t.table));
            for (const v of views) entry(String(v.schema)).views.push(String(v.view_name));
            return [...bySchema.values()].sort((a, b) => a.schema.localeCompare(b.schema));
        });
    }

    async introspect({ schemas }: IntrospectOptions): Promise<DatabaseMetadata> {
        return withReadOnlyTransaction(this.client, async () => {
            // sequential: one connection cannot run queries in parallel
            const server = (await this.query(POSTGRES_QUERIES.server, []))[0];
            const tables = await this.query(POSTGRES_QUERIES.tables, schemas);
            const views = await this.query(POSTGRES_QUERIES.views, schemas);
            const columns = await this.query(POSTGRES_QUERIES.columns, schemas);
            const pks = await this.query(POSTGRES_QUERIES.primaryKeys, schemas);
            const fks = await this.query(POSTGRES_QUERIES.foreignKeys, schemas);
            const indexes = await this.query(POSTGRES_QUERIES.indexes, schemas);
            const enums = await this.query(POSTGRES_QUERIES.enums, schemas);
            const composites = await this.query(
                POSTGRES_QUERIES.composites,
                schemas
            );
            const checks = await this.query(POSTGRES_QUERIES.checks, schemas);

            return {
                database_name: String(server.database_name),
                version: String(server.version),
                // like QBase's own scripts, views are listed as tables too
                // (type VIEW); the views list only carries their definitions
                tables: [
                    ...tables.map((t) => ({
                        schema: String(t.schema),
                        table: String(t.table),
                        rows: num(t.rows),
                        type: String(t.type),
                        comment: t.comment ? String(t.comment) : undefined,
                    })),
                    ...views.map((v) => ({
                        schema: String(v.schema),
                        table: String(v.view_name),
                        type: 'VIEW',
                    })),
                ],
                views: views.map((v) => ({
                    schema: String(v.schema),
                    view_name: String(v.view_name),
                    // pg_get_viewdef returns only the SELECT; QBase parses a
                    // full CREATE VIEW statement to find what a view depends on
                    view_definition: v.view_definition
                        ? encodeViewDefinition(
                              `CREATE ${v.materialized ? 'MATERIALIZED ' : ''}VIEW ${String(v.qualified_name)} AS ${String(
                                  v.view_definition
                              )
                                  .trim()
                                  .replace(/;$/, '')}`,
                              'utf8'
                          )
                        : undefined,
                })),
                columns: columns.map((c) => {
                    const { base, isArray } = splitArrayType(String(c.type));
                    const decoded = decodeTypmod(base, Number(c.typmod));
                    return {
                        schema: String(c.schema),
                        table: String(c.table),
                        name: String(c.name),
                        type: base,
                        ordinal_position: Number(c.ordinal_position),
                        nullable: Boolean(c.nullable),
                        character_maximum_length: decoded.characterMaximumLength,
                        precision: decoded.precision,
                        default: c.default === null ? null : String(c.default),
                        collation: c.collation ? String(c.collation) : null,
                        comment: c.comment ? String(c.comment) : null,
                        is_identity: Boolean(c.is_identity),
                        is_array: isArray,
                        domain: c.domain ? String(c.domain) : null,
                        generated: c.generated_expression
                            ? {
                                  expression: String(c.generated_expression),
                                  stored: Boolean(c.generated_stored),
                              }
                            : null,
                    };
                }),
                pk_info: pks.map((p) => ({
                    schema: String(p.schema),
                    table: String(p.table),
                    column: String(p.column),
                    pk_def: String(p.pk_def),
                })),
                fk_info: fks.map((f) => ({
                    schema: String(f.schema),
                    table: String(f.table),
                    column: String(f.column),
                    foreign_key_name: String(f.foreign_key_name),
                    reference_schema: String(f.reference_schema),
                    reference_table: String(f.reference_table),
                    reference_column: String(f.reference_column),
                    fk_def: String(f.fk_def),
                })),
                indexes: indexes.map((i) => ({
                    schema: String(i.schema),
                    table: String(i.table),
                    name: String(i.name),
                    column: String(i.column),
                    index_type: String(i.index_type),
                    unique: Boolean(i.unique),
                    primary: Boolean(i.primary),
                    direction: String(i.direction),
                    column_position: Number(i.column_position),
                    where: i.where ? String(i.where) : null,
                })),
                check_constraints: checks.map((c) => ({
                    schema: String(c.schema),
                    table: String(c.table),
                    expression: String(c.expression),
                })),
                custom_types: [
                    ...enums.map((e) => ({
                        schema: String(e.schema),
                        type: String(e.type),
                        kind: 'enum' as const,
                        values: Array.isArray(e.values)
                            ? e.values.map(String)
                            : [],
                    })),
                    ...composites.map((t) => ({
                        schema: String(t.schema),
                        type: String(t.type),
                        kind: 'composite' as const,
                        fields: Array.isArray(t.fields)
                            ? t.fields.map((f: Record<string, unknown>) => ({
                                  field: String(f.field),
                                  type: String(f.type),
                              }))
                            : [],
                    })),
                ],
            };
        });
    }

    async close(): Promise<void> {
        await this.client.end().catch(() => undefined);
    }
}

/** TLS options for a connection. SNI must be a hostname, so an IP literal sends none. */
export function postgresSsl(
    params: Pick<ConnectionParams, 'ssl' | 'host' | 'trustServerCertificate'>
) {
    if (!params.ssl) return false;
    return {
        ...(isIP(params.host) ? {} : { servername: params.host }),
        rejectUnauthorized: !params.trustServerCertificate,
    };
}

export async function connectPostgres(
    params: ConnectionParams,
    target: ResolvedTarget,
    maxResponseBytes: number = MAX_RESPONSE_BYTES
): Promise<Introspector> {
    const client = new pg.Client({
        // our own socket, so what the server sends can be counted and cut off
        stream: () => limitReceivedBytes(new net.Socket(), maxResponseBytes),
        // connect to the address we already vetted, not the hostname again
        host: target.address,
        port: params.port,
        database: params.database,
        user: params.user,
        password: params.password,
        ssl: postgresSsl(params),
        connectionTimeoutMillis: 10_000,
        statement_timeout: STATEMENT_TIMEOUT_MS,
        query_timeout: STATEMENT_TIMEOUT_MS + 5_000,
        application_name: 'qbase-introspect',
    });
    await client.connect();
    return new PostgresIntrospector(client);
}
