import type { Dialect } from '../dialect';
import { postgresql } from '../postgresql';

/** CockroachDB: PostgreSQL's reader and writer, without user-defined types. */
export const cockroachdb: Dialect = {
    ...postgresql,
    id: 'cockroachdb',
    label: 'CockroachDB',
    variantOf: 'postgresql',
    capabilities: {
        ...postgresql.capabilities,
        enumTypes: false,
        compositeTypes: false,
        materializedViews: true,
    },
};
