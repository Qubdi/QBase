import type { Dialect } from '../dialect';
import { readSqlite } from './read';
import { writeSqlite } from './write';
import { quoteDouble } from '../shared/text';

export const SQLITE_TYPES: readonly string[] = [
    'integer',
    'text',
    'real',
    'blob',
    'null',
    'int',
    'varchar',
    'timestamp',
    'numeric',
    'decimal',
    'float',
    'double',
    'json',
    'char',
    'binary',
    'varbinary',
    'smallint',
    'bigint',
    'bool',
    'boolean',
    'time',
    'date',
    'datetime',
];

export const sqlite: Dialect = {
    id: 'sqlite',
    label: 'SQLite',
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
        numbering: 'integer-key-only',
    },
    types: SQLITE_TYPES,
    defaultType: 'integer',
    sql: {
        source: { flavour: 'sqlite' },
        target: {
            flavour: 'sqlite',
            quote: quoteDouble,
            identifierLimit: 1000,
        },
        read: readSqlite,
        write: writeSqlite,
    },
};
