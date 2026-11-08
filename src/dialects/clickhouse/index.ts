import type { Dialect } from '../dialect';
import { ownHeader, writeGenericSql } from '../generic/write';

const UNSIGNED = ['UInt8', 'UInt16', 'UInt32', 'UInt64', 'UInt128', 'UInt256'];
const SIGNED = ['Int8', 'Int16', 'Int32', 'Int64', 'Int128', 'Int256'];

export const CLICKHOUSE_TYPES: readonly string[] = [
    ...UNSIGNED,
    ...SIGNED,
    'Float32',
    'Float64',
    'Decimal',
    'Decimal32',
    'Decimal64',
    'Decimal128',
    'Decimal256',
    'String',
    'FixedString',
    'Date',
    'Date32',
    'DateTime',
    'DateTime64',
    'UUID',
    'Bool',
    'Boolean',
    'Enum',
    'Enum8',
    'Enum16',
    'LowCardinality',
    'Tuple',
    'Map',
    'Nested',
    'Array',
    'IPv4',
    'IPv6',
    'Point',
    'Ring',
    'Polygon',
    'MultiPolygon',
    'JSON',
    // the SQL-standard names ClickHouse accepts as aliases
    'bigint',
    'int',
    'integer',
    'smallint',
    'tinyint',
    'float',
    'double',
    'real',
    'numeric',
    'char',
    'varchar',
    'text',
    'blob',
    'binary',
    'timestamp',
];

const capabilities: Dialect['capabilities'] = {
    schemas: true,
    enumTypes: false,
    compositeTypes: false,
    arrayColumns: false,
    checkConstraints: false,
    views: true,
    materializedViews: false,
    nativeComments: false,
    indexMethods: [],
    numbering: 'none',
};

/**
 * ClickHouse (EXP-008, restored): no SQL reader (only the metadata and DBML
 * flows bring a schema in); SQL is written by the generic generator with a
 * warning header, using ClickHouse's own spelling of its types.
 */
export const clickhouse: Dialect = {
    id: 'clickhouse',
    label: 'ClickHouse',
    capabilities,
    types: CLICKHOUSE_TYPES,
    defaultType: 'bigint',
    defaultSchema: 'default',
    sql: {
        write: (design) =>
            writeGenericSql(design, {
                capabilities,
                header: ownHeader('ClickHouse'),
                spelling: CLICKHOUSE_TYPES,
            }),
    },
};
