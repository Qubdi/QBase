// The server speaks the exact JSON format ChartDB's own "Smart Query" import
// uses. Reusing the frontend's type means a change there breaks this build,
// and the existing loader turns it into a diagram with ChartDB's type mapping.
import type { DatabaseMetadata } from '../../../src/lib/data/import-metadata/metadata-types/database-metadata';
import type { ResolvedTarget } from './net-guard.js';

export type { DatabaseMetadata };

export type Dialect = 'postgresql' | 'sqlserver';

export interface ConnectionParams {
    dialect: Dialect;
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    /** encrypt the connection */
    ssl: boolean;
    /** accept self-signed / unverifiable server certificates */
    trustServerCertificate: boolean;
}

export interface CatalogSchema {
    schema: string;
    tables: string[];
    views: string[];
}

export interface IntrospectOptions {
    /** empty means every non-system schema */
    schemas: string[];
}

/** One interface for every database engine. */
export interface Introspector {
    catalog(): Promise<CatalogSchema[]>;
    introspect(options: IntrospectOptions): Promise<DatabaseMetadata>;
    close(): Promise<void>;
}

export type IntrospectorFactory = (
    params: ConnectionParams,
    target: ResolvedTarget
) => Promise<Introspector>;

export const DEFAULT_PORTS: Record<Dialect, number> = {
    postgresql: 5432,
    sqlserver: 1433,
};

export const STATEMENT_TIMEOUT_MS = 20_000;

/**
 * ChartDB's importer expects view definitions base64-encoded (the same form its
 * own query scripts produce): UTF-8 for most engines, UTF-16LE for SQL Server.
 */
export const encodeViewDefinition = (
    text: string,
    encoding: 'utf8' | 'utf16le'
): string => Buffer.from(text, encoding).toString('base64');
