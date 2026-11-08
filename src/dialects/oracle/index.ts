import type { Dialect } from '../dialect';
import { ownHeader, writeGenericSql } from '../generic/write';
import { readOracle } from './read';

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
    indexMethods: [],
    numbering: 'identity-property',
};

/**
 * Oracle (EXP-008, restored): its own reader and type list; SQL is written by
 * the generic generator with a warning header, as the old editor did.
 */
export const oracle: Dialect = {
    id: 'oracle',
    label: 'Oracle',
    capabilities,
    types: ORACLE_TYPES,
    defaultType: 'number',
    // Oracle has schemas but no default schema name (editor 14.1)
    sql: {
        read: readOracle,
        write: (design) =>
            writeGenericSql(design, {
                capabilities,
                header: ownHeader('Oracle'),
            }),
    },
};
