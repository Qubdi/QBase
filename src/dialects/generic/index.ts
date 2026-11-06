import type { DatabaseType } from '@/core/model/database';
import type { Dialect } from '../dialect';

export const GENERIC_TYPES: readonly string[] = [
    'varchar',
    'int',
    'text',
    'boolean',
    'date',
    'timestamp',
    'decimal',
    'datetime',
    'json',
    'uuid',
    'bigint',
    'binary',
    'blob',
    'char',
    'double',
    'enum',
    'float',
    'numeric',
    'real',
    'set',
    'smallint',
    'time',
    'varbinary',
];

/** Read-only fallback for generic diagrams and for ids with no dialect module. */
export function readOnlyDialect(id: DatabaseType, label: string): Dialect {
    return {
        id,
        label,
        capabilities: {
            schemas: false,
            enumTypes: false,
            compositeTypes: false,
            arrayColumns: false,
            checkConstraints: true,
            views: true,
            materializedViews: false,
            nativeComments: false,
            indexMethods: [],
            numbering: 'none',
        },
        types: GENERIC_TYPES,
        defaultType: 'bigint',
        sql: {},
    };
}

export const generic: Dialect = readOnlyDialect('generic', 'Generic');
