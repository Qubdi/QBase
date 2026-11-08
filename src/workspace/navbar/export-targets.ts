import type { DatabaseType } from '@/core/model/database';
import { dialectFor } from '@/dialects/registry';

/** The six targets, offered after the diagram's own database (spec A6, EXP-001). */
export const EXPORT_TARGETS: readonly DatabaseType[] = [
    'postgresql',
    'mysql',
    'sql_server',
    'mariadb',
    'sqlite',
    'oracle',
];

/**
 * The SQL export targets for a diagram: its own database first, then the
 * other five without repeating it.
 */
export function exportTargets(own: DatabaseType): DatabaseType[] {
    const first = dialectFor(own).sql.write ? [own] : [];
    return [...first, ...EXPORT_TARGETS.filter((t) => t !== own)];
}
