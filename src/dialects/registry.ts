import type { DatabaseType } from '@/core/model/database';
import { DATABASE_TYPES } from '@/core/model/database';
import type { Dialect } from './dialect';
import { cockroachdb } from './cockroachdb';
import { generic, readOnlyDialect } from './generic';
import { mariadb } from './mariadb';
import { mysql } from './mysql';
import { postgresql } from './postgresql';
import { sqlServer } from './sql-server';
import { sqlite } from './sqlite';

const MODULES: readonly Dialect[] = [
    generic,
    postgresql,
    mysql,
    sqlServer,
    mariadb,
    sqlite,
    cockroachdb,
];

const LABELS: Record<DatabaseType, string> = {
    generic: 'Generic',
    postgresql: 'PostgreSQL',
    mysql: 'MySQL',
    sql_server: 'SQL Server',
    mariadb: 'MariaDB',
    sqlite: 'SQLite',
    clickhouse: 'ClickHouse',
    cockroachdb: 'CockroachDB',
    oracle: 'Oracle',
};

const TABLE = new Map<string, Dialect>(MODULES.map((d) => [d.id, d]));

/** The dialect for an id; unknown or dropped ids resolve to a read-only generic one. */
export function dialectFor(id: string): Dialect {
    const found = TABLE.get(id);
    if (found) return found;
    const known = (DATABASE_TYPES as readonly string[]).includes(id);
    return readOnlyDialect(
        known ? (id as DatabaseType) : 'generic',
        known ? LABELS[id as DatabaseType] : id
    );
}

/** Dialects offered in pickers: those with a module, generic first. */
export function listDialects(): readonly Dialect[] {
    return MODULES;
}

/** Dialects that can write SQL. */
export function writableDialects(): Dialect[] {
    return MODULES.filter((d) => d.sql.write);
}

export { detectDialect } from './detect';
