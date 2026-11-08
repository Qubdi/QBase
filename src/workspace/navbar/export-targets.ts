import type { DatabaseType } from '@/core/model/database';
import { dialectFor } from '@/dialects/registry';

/** Targets offered after the diagram's own database (spec A6, EXP-001). */
export const EXPORT_TARGETS: readonly DatabaseType[] = [
    'postgresql',
    'mysql',
    'sql_server',
    'mariadb',
    'sqlite',
];

/**
 * The SQL export targets for a diagram: its own database first when it can be
 * written (Oracle and ClickHouse through the generic generator, EXP-008), then
 * the standard five without repeating it. Oracle, ClickHouse and CockroachDB
 * are never offered as targets for another database's diagram.
 */
export function exportTargets(own: DatabaseType): DatabaseType[] {
    const first = dialectFor(own).sql.write ? [own] : [];
    return [...first, ...EXPORT_TARGETS.filter((t) => t !== own)];
}
