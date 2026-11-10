import type { DbConnectionInput, DbDialect, SavedConnection } from './api';

export const DEFAULT_PORT: Record<DbDialect, string> = {
    postgresql: '5432',
    sqlserver: '1433',
};

export const DIALECT_LABEL: Record<DbDialect, string> = {
    postgresql: 'PostgreSQL',
    sqlserver: 'SQL Server',
};

/** What the connection form holds while it is being filled in. */
export interface ConnectionForm {
    name: string;
    dialect: DbDialect;
    host: string;
    port: string;
    database: string;
    user: string;
    /** left empty when editing, the saved password stays */
    password: string;
    ssl: boolean;
    trustServerCertificate: boolean;
}

export const emptyConnectionForm = (): ConnectionForm => ({
    name: '',
    dialect: 'postgresql',
    host: '',
    port: DEFAULT_PORT.postgresql,
    database: '',
    user: '',
    password: '',
    // a new connection is encrypted unless the user turns it off
    ssl: true,
    trustServerCertificate: false,
});

/** The form for editing a saved connection; its password is never sent back. */
export const formFromConnection = (c: SavedConnection): ConnectionForm => ({
    name: c.name,
    dialect: c.dialect,
    host: c.host,
    port: String(c.port),
    database: c.database,
    user: c.user,
    password: '',
    ssl: c.ssl,
    trustServerCertificate: c.trustServerCertificate,
});

/** The connection fields the server takes, trimmed. A blank port means the default. */
export const formToConnection = (f: ConnectionForm): DbConnectionInput => ({
    dialect: f.dialect,
    host: f.host.trim(),
    port: Number(f.port) || undefined,
    database: f.database.trim(),
    user: f.user.trim(),
    password: f.password,
    ssl: f.ssl,
    trustServerCertificate: f.trustServerCertificate,
});

/** One line that says where a saved connection points. */
export const describeConnection = (c: SavedConnection): string =>
    `${DIALECT_LABEL[c.dialect]} · ${c.host}:${c.port}/${c.database} · ${c.user}`;
