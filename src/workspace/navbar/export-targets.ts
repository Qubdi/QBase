import { isOpenOnly } from '@/core/model/database';
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
 * written, then the standard five without repeating it. Open-only databases
 * export nothing.
 */
export function exportTargets(own: DatabaseType): DatabaseType[] {
    if (isOpenOnly(own)) return [];
    const first = dialectFor(own).sql.write ? [own] : [];
    return [...first, ...EXPORT_TARGETS.filter((t) => t !== own)];
}
