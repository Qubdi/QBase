import sql from 'mssql';
import net from 'node:net';
import { assertReadOnlySql } from './readonly-guard.js';
import type { ResolvedTarget } from './net-guard.js';
import {
    STATEMENT_TIMEOUT_MS,
    encodeViewDefinition,
    type CatalogSchema,
    type ConnectionParams,
    type DatabaseMetadata,
    type IntrospectOptions,
    type Introspector,
} from './types.js';

// @schemas is a comma separated list; empty means "all user schemas".
const SCHEMA_FILTER = (alias: string) =>
    `(@schemas = '' OR ${alias}.name IN (SELECT value FROM STRING_SPLIT(@schemas, ',')))`;

export const SQLSERVER_QUERIES = {
    server: `SELECT DB_NAME() AS database_name, @@VERSION AS version`,

    tables: `
        SELECT s.name AS [schema], t.name AS [table], 'BASE TABLE' AS type,
               CAST(ep.value AS nvarchar(4000)) AS comment,
               (SELECT SUM(p.rows) FROM sys.partitions p
                 WHERE p.object_id = t.object_id AND p.index_id IN (0, 1)) AS [rows]
        FROM sys.tables t
        JOIN sys.schemas s ON s.schema_id = t.schema_id
        LEFT JOIN sys.extended_properties ep
               ON ep.class = 1 AND ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
        WHERE t.is_ms_shipped = 0 AND ${SCHEMA_FILTER('s')}
        ORDER BY s.name, t.name`,

    views: `
        SELECT s.name AS [schema], v.name AS view_name,
               OBJECT_DEFINITION(v.object_id) AS view_definition
        FROM sys.views v
        JOIN sys.schemas s ON s.schema_id = v.schema_id
        WHERE v.is_ms_shipped = 0 AND ${SCHEMA_FILTER('s')}
        ORDER BY s.name, v.name`,

    columns: `
        SELECT s.name AS [schema], o.name AS [table], c.name AS name,
               ty.name AS type, c.max_length AS max_length, c.precision AS [precision], c.scale AS scale,
               c.column_id AS ordinal_position, c.is_nullable AS nullable,
               dc.definition AS [default], CAST(ep.value AS nvarchar(4000)) AS comment,
               c.is_identity AS is_identity, c.collation_name AS collation
        FROM sys.columns c
        JOIN sys.objects o ON o.object_id = c.object_id AND o.type IN ('U', 'V')
        JOIN sys.schemas s ON s.schema_id = o.schema_id
        JOIN sys.types ty ON ty.user_type_id = c.user_type_id
        LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
        LEFT JOIN sys.extended_properties ep
               ON ep.class = 1 AND ep.major_id = c.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description'
        WHERE o.is_ms_shipped = 0 AND ${SCHEMA_FILTER('s')}
        ORDER BY s.name, o.name, c.column_id`,

    primaryKeys: `
        SELECT s.name AS [schema], t.name AS [table], c.name AS [column], ic.key_ordinal AS ord
        FROM sys.indexes i
        JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        JOIN sys.tables t ON t.object_id = i.object_id
        JOIN sys.schemas s ON s.schema_id = t.schema_id
        WHERE i.is_primary_key = 1 AND ic.is_included_column = 0
          AND t.is_ms_shipped = 0 AND ${SCHEMA_FILTER('s')}
        ORDER BY s.name, t.name, ic.key_ordinal`,

    foreignKeys: `
        SELECT s.name AS [schema], t.name AS [table], pc.name AS [column], fk.name AS foreign_key_name,
               rs.name AS reference_schema, rt.name AS reference_table, rc.name AS reference_column,
               fk.delete_referential_action_desc AS on_delete,
               fk.update_referential_action_desc AS on_update,
               fkc.constraint_column_id AS ord
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
        JOIN sys.tables t ON t.object_id = fk.parent_object_id
        JOIN sys.schemas s ON s.schema_id = t.schema_id
        JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
        JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id
        JOIN sys.schemas rs ON rs.schema_id = rt.schema_id
        JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
        WHERE t.is_ms_shipped = 0 AND ${SCHEMA_FILTER('s')}
        ORDER BY s.name, t.name, fk.name, fkc.constraint_column_id`,

    indexes: `
        SELECT s.name AS [schema], t.name AS [table], i.name AS name, c.name AS [column],
               i.type_desc AS index_type, i.is_unique AS [unique],
               CASE WHEN ic.is_descending_key = 1 THEN 'DESC' ELSE 'ASC' END AS direction,
               ic.key_ordinal AS column_position
        FROM sys.indexes i
        JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        JOIN sys.tables t ON t.object_id = i.object_id
        JOIN sys.schemas s ON s.schema_id = t.schema_id
        WHERE i.type > 0 AND i.is_hypothetical = 0 AND ic.is_included_column = 0 AND ic.key_ordinal > 0
          AND t.is_ms_shipped = 0 AND ${SCHEMA_FILTER('s')}
        ORDER BY s.name, t.name, i.name, ic.key_ordinal`,
} as const;

// --- pure conversion helpers (unit tested without a server) -----------------

const NCHAR_TYPES = new Set(['nchar', 'nvarchar']);
const CHAR_TYPES = new Set(['char', 'varchar', 'binary', 'varbinary']);
const EXACT_NUMERIC = new Set(['decimal', 'numeric']);
const FRACTIONAL = new Set(['datetime2', 'datetimeoffset', 'time']);

export interface MssqlColumnShape {
    characterMaximumLength: string | null;
    precision: { precision: number | null; scale: number | null } | null;
}

/** sys.columns stores bytes for n* types and -1 for MAX; translate to what QBase expects. */
export function mssqlColumnShape(
    type: string,
    maxLength: number,
    precision: number,
    scale: number
): MssqlColumnShape {
    const t = type.toLowerCase();
    if (NCHAR_TYPES.has(t)) {
        return {
            characterMaximumLength: maxLength === -1 ? 'max' : String(maxLength / 2),
            precision: null,
        };
    }
    if (CHAR_TYPES.has(t)) {
        return {
            characterMaximumLength: maxLength === -1 ? 'max' : String(maxLength),
            precision: null,
        };
    }
    if (EXACT_NUMERIC.has(t)) {
        return { characterMaximumLength: null, precision: { precision, scale } };
    }
    if (FRACTIONAL.has(t)) {
        return {
            characterMaximumLength: null,
            precision: { precision: scale, scale: null },
        };
    }
    return { characterMaximumLength: null, precision: null };
}

const action = (desc: unknown) => String(desc ?? 'NO_ACTION').replace(/_/g, ' ');

export interface FkRow {
    schema: string;
    table: string;
    column: string;
    foreign_key_name: string;
    reference_schema: string;
    reference_table: string;
    reference_column: string;
    on_delete: string;
    on_update: string;
    ord: number;
}

/** QBase shows fk_def as text; build the PostgreSQL-style definition including actions. */
export function buildFkDefs(rows: FkRow[]): DatabaseMetadata['fk_info'] {
    const groups = new Map<string, FkRow[]>();
    for (const r of rows) {
        const k = `${r.schema}.${r.table}.${r.foreign_key_name}`;
        groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const out: DatabaseMetadata['fk_info'] = [];
    for (const group of groups.values()) {
        const ordered = [...group].sort((a, b) => a.ord - b.ord);
        const first = ordered[0];
        const def =
            `FOREIGN KEY (${ordered.map((r) => r.column).join(', ')}) ` +
            `REFERENCES ${first.reference_schema}.${first.reference_table} ` +
            `(${ordered.map((r) => r.reference_column).join(', ')}) ` +
            `ON DELETE ${action(first.on_delete)} ON UPDATE ${action(first.on_update)}`;
        for (const r of ordered) {
            out.push({
                schema: r.schema,
                table: r.table,
                column: r.column,
                foreign_key_name: r.foreign_key_name,
                reference_schema: r.reference_schema,
                reference_table: r.reference_table,
                reference_column: r.reference_column,
                fk_def: def,
            });
        }
    }
    return out;
}

export interface PkRow {
    schema: string;
    table: string;
    column: string;
    ord: number;
}

export function buildPkDefs(rows: PkRow[]): DatabaseMetadata['pk_info'] {
    const groups = new Map<string, PkRow[]>();
    for (const r of rows) {
        const k = `${r.schema}.${r.table}`;
        groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const out: DatabaseMetadata['pk_info'] = [];
    for (const group of groups.values()) {
        const ordered = [...group].sort((a, b) => a.ord - b.ord);
        const def = `PRIMARY KEY (${ordered.map((r) => r.column).join(', ')})`;
        for (const r of ordered) {
            out.push({
                schema: r.schema,
                table: r.table,
                column: r.column,
                pk_def: def,
            });
        }
    }
    return out;
}

// --- driver -------------------------------------------------------------------

type Row = Record<string, unknown>;

export class SqlServerIntrospector implements Introspector {
    constructor(private readonly pool: sql.ConnectionPool) {}

    private async query(text: string, schemas: string[]): Promise<Row[]> {
        assertReadOnlySql(text);
        const request = this.pool.request();
        if (text.includes('@schemas')) {
            request.input('schemas', sql.NVarChar(sql.MAX), schemas.join(','));
        }
        const result = await request.query(text);
        return result.recordset as Row[];
    }

    async catalog(): Promise<CatalogSchema[]> {
        const tables = await this.query(SQLSERVER_QUERIES.tables, []);
        const views = await this.query(SQLSERVER_QUERIES.views, []);
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
    }

    async introspect({ schemas }: IntrospectOptions): Promise<DatabaseMetadata> {
        const server = (await this.query(SQLSERVER_QUERIES.server, []))[0];
        const tables = await this.query(SQLSERVER_QUERIES.tables, schemas);
        const views = await this.query(SQLSERVER_QUERIES.views, schemas);
        const columns = await this.query(SQLSERVER_QUERIES.columns, schemas);
        const pks = await this.query(SQLSERVER_QUERIES.primaryKeys, schemas);
        const fks = await this.query(SQLSERVER_QUERIES.foreignKeys, schemas);
        const indexes = await this.query(SQLSERVER_QUERIES.indexes, schemas);

        return {
            database_name: String(server.database_name),
            version: String(server.version).split('\n')[0].trim(),
            // like QBase's own scripts, views are listed as tables too
            // (type VIEW); the views list only carries their definitions
            tables: [
                ...tables.map((t) => ({
                    schema: String(t.schema),
                    table: String(t.table),
                    rows:
                        t.rows === null || t.rows === undefined
                            ? undefined
                            : Number(t.rows),
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
                view_definition: v.view_definition
                    ? encodeViewDefinition(String(v.view_definition), 'utf16le')
                    : undefined,
            })),
            columns: columns.map((c) => {
                const shape = mssqlColumnShape(
                    String(c.type),
                    Number(c.max_length),
                    Number(c.precision),
                    Number(c.scale)
                );
                return {
                    schema: String(c.schema),
                    table: String(c.table),
                    name: String(c.name),
                    type: String(c.type),
                    ordinal_position: Number(c.ordinal_position),
                    nullable: Boolean(c.nullable),
                    character_maximum_length: shape.characterMaximumLength,
                    precision: shape.precision,
                    default: c.default === null || c.default === undefined ? null : String(c.default),
                    collation: c.collation ? String(c.collation) : null,
                    comment: c.comment ? String(c.comment) : null,
                    is_identity: Boolean(c.is_identity),
                    is_array: false,
                };
            }),
            pk_info: buildPkDefs(
                pks.map((p) => ({
                    schema: String(p.schema),
                    table: String(p.table),
                    column: String(p.column),
                    ord: Number(p.ord),
                }))
            ),
            fk_info: buildFkDefs(
                fks.map((f) => ({
                    schema: String(f.schema),
                    table: String(f.table),
                    column: String(f.column),
                    foreign_key_name: String(f.foreign_key_name),
                    reference_schema: String(f.reference_schema),
                    reference_table: String(f.reference_table),
                    reference_column: String(f.reference_column),
                    on_delete: String(f.on_delete),
                    on_update: String(f.on_update),
                    ord: Number(f.ord),
                }))
            ),
            indexes: indexes.map((i) => ({
                schema: String(i.schema),
                table: String(i.table),
                name: String(i.name),
                column: String(i.column),
                index_type: String(i.index_type),
                unique: Boolean(i.unique),
                direction: String(i.direction),
                column_position: Number(i.column_position),
            })),
        };
    }

    async close(): Promise<void> {
        await this.pool.close().catch(() => undefined);
    }
}

/** What tedious asks its connector to dial. */
interface DialOptions {
    host: string;
    port: number;
    localAddress?: string;
}

/**
 * A connector that dials the address the net guard already vetted, and
 * nothing else. tedious follows a login answer that redirects the client to
 * another host and port, and dials that host without asking the guard, which
 * would let a hostile server point us at an internal address. Here a request
 * for any other host or port fails instead.
 */
export function pinnedConnector(
    target: Pick<ResolvedTarget, 'address'>,
    port: number
) {
    return (
        opts: DialOptions,
        _lookup: unknown,
        signal: AbortSignal
    ): Promise<net.Socket> => {
        if (opts.host !== target.address || opts.port !== port) {
            return Promise.reject(
                new Error(
                    'The server asked to redirect the connection, which is not allowed.'
                )
            );
        }
        return new Promise((resolve, reject) => {
            if (signal.aborted) return reject(signal.reason);
            const socket = net.connect({
                host: target.address,
                port,
                localAddress: opts.localAddress,
            });
            const done = () => {
                signal.removeEventListener('abort', onAbort);
                socket.removeListener('error', onError);
                socket.removeListener('connect', onConnect);
            };
            const onConnect = () => {
                done();
                resolve(socket);
            };
            const onError = (err: Error) => {
                done();
                socket.destroy();
                reject(err);
            };
            const onAbort = () => {
                done();
                socket.destroy();
                reject(signal.reason);
            };
            socket.once('connect', onConnect);
            socket.once('error', onError);
            signal.addEventListener('abort', onAbort, { once: true });
        });
    };
}

export async function connectSqlServer(
    params: ConnectionParams,
    target: ResolvedTarget
): Promise<Introspector> {
    const pool = new sql.ConnectionPool({
        // connect to the address we already vetted, not the hostname again
        server: target.address,
        port: params.port,
        database: params.database,
        user: params.user,
        password: params.password,
        connectionTimeout: 10_000,
        requestTimeout: STATEMENT_TIMEOUT_MS,
        pool: { max: 1, min: 0 },
        options: {
            encrypt: params.ssl,
            trustServerCertificate: params.trustServerCertificate,
            // certificate/SNI validation must use the name the user typed
            ...(net.isIP(params.host) ? {} : { serverName: params.host }),
            readOnlyIntent: true,
            appName: 'qbase-introspect',
            // tedious calls it with (options, lookup, signal); its typings say none
            connector: pinnedConnector(
                target,
                params.port
            ) as unknown as () => Promise<net.Socket>,
        },
    });
    await pool.connect();
    return new SqlServerIntrospector(pool);
}
