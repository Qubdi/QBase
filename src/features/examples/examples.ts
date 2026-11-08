import type { DatabaseType } from '@/core/model/database';
import { DOMAINS } from './domains';
import type { Domain } from './spec';

/**
 * One example diagram per database, written for QBase in that database's own
 * SQL (ClickHouse in DBML). Each is a large, realistic schema with areas,
 * sticky notes and descriptions; see `domains/` for the tables and
 * `build-example.ts` for how a domain becomes a diagram.
 */
export interface Example {
    id: string;
    databaseType: DatabaseType;
    /** the name the new diagram gets */
    name: string;
    domain: Domain;
}

export const EXAMPLES: readonly Example[] = DOMAINS.map((domain) => ({
    id: domain.id,
    databaseType: domain.databaseType,
    name: domain.name,
    domain,
}));
