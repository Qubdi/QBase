import { INDEX_METHODS } from '@/core/model/index-methods';
import type { Dialect } from '../dialect';
import { quoteDouble } from '../shared/text';
import { readOracle } from './read';
import { writeOracle } from './write';

export const ORACLE_TYPES: readonly string[] = [
    'varchar2',
    'nvarchar2',
    'char',
    'nchar',
    'clob',
    'nclob',
    'number',
    'float',
    'binary_float',
    'binary_double',
    'date',
    'timestamp',
    'timestamp with time zone',
    'timestamp with local time zone',
    'interval year to month',
    'interval day to second',
    'blob',
    'bfile',
    'raw',
    'long raw',
    'rowid',
    'urowid',
    'xmltype',
];

const capabilities: Dialect['capabilities'] = {
    schemas: true,
    enumTypes: false,
    compositeTypes: false,
    arrayColumns: false,
    checkConstraints: true,
    views: true,
    materializedViews: false,
    nativeComments: true,
    indexMethods: INDEX_METHODS.oracle,
    numbering: 'identity-property',
};

/** Oracle 12c and later: its own reader and writer, and converts to and from the other databases. */
export const oracle: Dialect = {
    id: 'oracle',
    label: 'Oracle',
    capabilities,
    types: ORACLE_TYPES,
    defaultType: 'number',
    // Oracle has schemas but no default schema name (editor 14.1)
    sql: {
        source: { flavour: 'oracle' },
        target: {
            flavour: 'oracle',
            quote: quoteDouble,
            identifierLimit: 128,
        },
        read: readOracle,
        write: writeOracle,
    },
};
