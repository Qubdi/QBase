import { INDEX_METHODS } from '@/core/model/index-methods';
import type { Dialect } from '../dialect';
import { POSTGRES_TYPE_SYNONYMS, fixPostgres, readPostgres } from './read';
import { writePostgres } from './write';
import { quoteDouble } from '../shared/text';

const GEOMETRIC = ['point', 'line', 'lseg', 'box', 'path', 'polygon', 'circle'];
const NETWORK = ['cidr', 'inet', 'macaddr', 'macaddr8'];
const RANGES = [
    'int4range',
    'int8range',
    'numrange',
    'tsrange',
    'tstzrange',
    'daterange',
];
const OBJECT_IDS = [
    'oid',
    'regclass',
    'regcollation',
    'regconfig',
    'regdictionary',
    'regnamespace',
    'regoper',
    'regoperator',
    'regproc',
    'regprocedure',
    'regrole',
    'regtype',
];

export const POSTGRES_TYPES: readonly string[] = [
    'integer',
    'int',
    'int4',
    'int2',
    'int8',
    'smallint',
    'bigint',
    'serial',
    'smallserial',
    'bigserial',
    'varchar',
    'char',
    'text',
    'boolean',
    'bool',
    'numeric',
    'real',
    'float4',
    'float8',
    'double precision',
    'money',
    'timestamp',
    'timestamptz',
    'date',
    'time',
    'timetz',
    'interval',
    'json',
    'jsonb',
    'uuid',
    'bytea',
    'enum',
    ...GEOMETRIC,
    ...NETWORK,
    ...RANGES,
    ...OBJECT_IDS,
    'bit',
    'bit varying',
    'varbit',
    'tsvector',
    'tsquery',
    'xml',
    'user-defined',
];

export const postgresql: Dialect = {
    id: 'postgresql',
    label: 'PostgreSQL',
    capabilities: {
        schemas: true,
        enumTypes: true,
        compositeTypes: true,
        arrayColumns: true,
        checkConstraints: true,
        views: true,
        materializedViews: true,
        nativeComments: true,
        indexMethods: INDEX_METHODS.postgresql,
        numbering: 'serial',
    },
    types: POSTGRES_TYPES,
    defaultType: 'bigint',
    defaultSchema: 'public',
    typeSynonyms: POSTGRES_TYPE_SYNONYMS,
    sql: {
        source: { flavour: 'postgres', defaultSchema: 'public' },
        target: {
            flavour: 'postgres',
            quote: quoteDouble,
            identifierLimit: 63,
        },
        read: readPostgres,
        write: writePostgres,
        fix: fixPostgres,
    },
};
