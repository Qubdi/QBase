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
