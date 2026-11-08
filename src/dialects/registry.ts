import type { Dialect } from './dialect';
import { clickhouse } from './clickhouse';
import { cockroachdb } from './cockroachdb';
import { generic, readOnlyDialect } from './generic';
import { mariadb } from './mariadb';
import { mysql } from './mysql';
import { oracle } from './oracle';
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
    oracle,
    clickhouse,
];

const TABLE = new Map<string, Dialect>(MODULES.map((d) => [d.id, d]));

/** The dialect for an id; an unknown id resolves to a read-only generic one that keeps its name. */
export function dialectFor(id: string): Dialect {
    return TABLE.get(id) ?? readOnlyDialect('generic', id);
}

/** Dialects offered in pickers, generic first. */
export function listDialects(): readonly Dialect[] {
    return MODULES;
}

/** Dialects that can write SQL. */
export function writableDialects(): Dialect[] {
    return MODULES.filter((d) => d.sql.write);
}

export { detectDialect } from './detect';
