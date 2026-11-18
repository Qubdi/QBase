import type { Column } from './column';
import type { DatabaseType } from './database';
import type { Key, KeyMethod } from './key';

/**
 * The index types each database offers, the one a new index gets first. SQLite
 * has only one kind of index, so there is nothing to choose.
 */
export const INDEX_METHODS: Readonly<
    Record<DatabaseType, readonly KeyMethod[]>
> = {
    postgresql: ['btree', 'hash', 'gist', 'gin', 'spgist', 'brin'],
    mysql: ['btree', 'hash', 'fulltext', 'spatial'],
    mariadb: ['btree', 'hash', 'fulltext', 'spatial'],
    sql_server: ['nonclustered', 'clustered', 'columnstore', 'xml'],
    sqlite: [],
    oracle: ['btree', 'bitmap'],
};

/** The type a new index of a database has; none where there is no choice. */
export function defaultMethodOf(type: DatabaseType): KeyMethod | undefined {
    return INDEX_METHODS[type][0];
}

/** Why an index type cannot be used for an index: the key of the reason, under `indexes.problem`. */
export type MethodProblem =
    | 'arrayOrJson'
    | 'oneField'
    | 'notUnique'
    | 'needsText'
    | 'needsGeometry'
    | 'needsXml'
    | 'oneClustered'
    | 'oneColumnstore'
    | 'needsPrimaryKey';

const GIN_TYPES = ['jsonb', 'json', 'tsvector', 'hstore'];
const TEXT_TYPES = [
    'char',
    'varchar',
    'tinytext',
    'text',
    'mediumtext',
    'longtext',
];
const GEOMETRY_TYPES = [
    'geometry',
    'point',
    'linestring',
    'polygon',
    'multipoint',
    'multilinestring',
    'multipolygon',
    'geometrycollection',
];

/** Whether `gin` may be used on these columns (DAT-044). */
export function canUseGin(columns: readonly Column[]): boolean {
    return (
        columns.length > 0 &&
        columns.every(
            (c) =>
                c.isArray === true ||
                GIN_TYPES.includes(c.type.id.toLowerCase())
        )
    );
}

const typeOf = (c: Column): string => c.type.id.toLowerCase();

/** The text and binary types of MySQL and MariaDB: an index on one needs a prefix length. */
const MYSQL_LONG_TYPES = [
    'tinytext',
    'text',
    'mediumtext',
    'longtext',
    'tinyblob',
    'blob',
    'mediumblob',
    'longblob',
];

/**
 * The types each database refuses in a unique index. PostgreSQL has no btree
 * operators for json, xml and the geometric types. MySQL and MariaDB need a
 * prefix length on text, blob and spatial types (which an index here cannot
 * carry) and cannot index json. SQL Server and Oracle cannot use their large
 * object, xml and spatial types as an index key. SQLite takes every type.
 */
const NO_UNIQUE_TYPES: Readonly<Record<DatabaseType, readonly string[]>> = {
    postgresql: [
        'json',
        'xml',
        'point',
        'line',
        'lseg',
        'box',
        'path',
        'polygon',
        'circle',
    ],
    mysql: [...MYSQL_LONG_TYPES, 'json', ...GEOMETRY_TYPES],
    mariadb: [...MYSQL_LONG_TYPES, 'json', ...GEOMETRY_TYPES],
    sql_server: [
        'text',
        'ntext',
        'image',
        'xml',
        'json',
        'geometry',
        'geography',
    ],
    sqlite: [],
    oracle: ['clob', 'nclob', 'blob', 'bfile', 'long_raw', 'xmltype'],
};

/**
 * The index types that cannot be unique, whatever fields they cover. It is the
 * `notUnique` answer of `methodProblem`, without the other reasons that come
 * first there (a test keeps the two the same).
 */
const NEVER_UNIQUE_METHODS: Readonly<Record<DatabaseType, readonly string[]>> =
    {
        postgresql: ['hash', 'gist', 'gin', 'spgist', 'brin'],
        mysql: ['fulltext', 'spatial'],
        mariadb: ['fulltext', 'spatial'],
        sql_server: ['columnstore', 'xml'],
        sqlite: [],
        oracle: ['bitmap'],
    };

/** Whether an index of this type can never be unique (only btree can, on PostgreSQL). */
export function methodCannotBeUnique(
    database: DatabaseType,
    method: KeyMethod | undefined
): boolean {
    return (
        method !== undefined && NEVER_UNIQUE_METHODS[database].includes(method)
    );
}

/** SQL Server types whose `max` length makes them too large to be an index key. */
const SQL_SERVER_MAX_TYPES = ['varchar', 'nvarchar', 'varbinary'];

/**
 * The columns among these that the database cannot put in a unique index,
 * because of their type. The ids of types with a space are written with an
 * underscore (`long raw` is `long_raw`).
 */
export function columnsBlockingUnique(
    database: DatabaseType,
    columns: readonly Column[]
): Column[] {
    const refused = NO_UNIQUE_TYPES[database];
    return columns.filter((c) => {
        const id = typeOf(c).trim().replace(/\s+/g, '_');
        return (
            refused.includes(id) ||
            (database === 'sql_server' &&
                c.length === 'max' &&
                SQL_SERVER_MAX_TYPES.includes(id))
        );
    });
}

/** What is already on the table that an index type must not be doubled with. */
export interface IndexSurroundings {
    /** the other indexes of the table, this one left out */
    others: readonly Key[];
    /** the table has a primary key */
    hasPrimaryKey: boolean;
}

/**
 * Why `method` cannot be used for an index on these columns, or undefined when
 * it can. Only what the database itself refuses is listed here.
 */
export function methodProblem(
    database: DatabaseType,
    method: KeyMethod,
    columns: readonly Column[],
    unique: boolean,
    around: IndexSurroundings
): MethodProblem | undefined {
    switch (database) {
        case 'postgresql':
            if (method === 'gin' && !canUseGin(columns)) return 'arrayOrJson';
            if (method === 'hash' && columns.length > 1) return 'oneField';
            if (method !== 'btree' && unique) return 'notUnique';
            return undefined;
        case 'mysql':
        case 'mariadb':
            if (method === 'fulltext') {
                if (
                    columns.length === 0 ||
                    !columns.every((c) => TEXT_TYPES.includes(typeOf(c)))
                )
                    return 'needsText';
                return unique ? 'notUnique' : undefined;
            }
            if (method === 'spatial') {
                if (
                    columns.length !== 1 ||
                    !GEOMETRY_TYPES.includes(typeOf(columns[0]))
                )
                    return 'needsGeometry';
                return unique ? 'notUnique' : undefined;
            }
            return undefined;
        case 'sql_server':
            if (
                method === 'clustered' &&
                around.others.some((k) => k.algorithm === 'clustered')
            )
                return 'oneClustered';
            if (method === 'columnstore') {
                if (unique) return 'notUnique';
                if (around.others.some((k) => k.algorithm === 'columnstore'))
                    return 'oneColumnstore';
            }
            if (method === 'xml') {
                if (columns.length !== 1 || typeOf(columns[0]) !== 'xml')
                    return 'needsXml';
                if (unique) return 'notUnique';
                if (!around.hasPrimaryKey) return 'needsPrimaryKey';
            }
            return undefined;
        case 'oracle':
            return method === 'bitmap' && unique ? 'notUnique' : undefined;
        default:
            return undefined;
    }
}
