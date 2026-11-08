import type { DatabaseType } from '@/core/model/database';

/** Step 1, Transactional tab, in card order (SHL-032): three cards per row. */
export const TRANSACTIONAL: readonly DatabaseType[] = [
    'mysql',
    'postgresql',
    'mariadb',
    'sqlite',
    'sql_server',
    'oracle',
    'cockroachdb',
];

/** Step 1, Analytical tab. */
export const ANALYTICAL: readonly DatabaseType[] = ['clickhouse'];

export const CARDS_PER_ROW = 3;
/** Rows visible at once; the More / Primary toggle moves the window by one row. */
export const VISIBLE_ROWS = 2;

/**
 * The logo of a database, as an image address. Empty on purpose (owner
 * decision, 2026-11-08): every card shows the neutral database icon until a
 * logo is added here.
 */
export const DATABASE_LOGOS: Partial<Record<DatabaseType, string>> = {};
