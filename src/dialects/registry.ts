import type { Dialect } from './dialect';
import { mariadb } from './mariadb';
import { mysql } from './mysql';
import { oracle } from './oracle';
import { postgresql } from './postgresql';
import { sqlServer } from './sql-server';
import { sqlite } from './sqlite';

const MODULES: readonly Dialect[] = [
    postgresql,
    mysql,
    sqlServer,
    mariadb,
    sqlite,
    oracle,
];

const TABLE = new Map<string, Dialect>(MODULES.map((d) => [d.id, d]));

/** The dialect for an id; an unknown id resolves to PostgreSQL, as a file with an unknown database does. */
export function dialectFor(id: string): Dialect {
    return TABLE.get(id) ?? postgresql;
}
