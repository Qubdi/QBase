import type { DatabaseType } from '@/core/model/database';

/** Step 1, in card order (SHL-032): the six databases, three cards per row. */
export const DATABASES: readonly DatabaseType[] = [
    'mysql',
    'postgresql',
    'mariadb',
    'sqlite',
    'sql_server',
    'oracle',
];

/** The database a new diagram is for until another card is chosen. */
export const DEFAULT_DATABASE: DatabaseType = 'postgresql';
