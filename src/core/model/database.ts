export const DATABASE_TYPES = [
    'postgresql',
    'mysql',
    'sql_server',
    'mariadb',
    'sqlite',
    'oracle',
] as const;

export type DatabaseType = (typeof DATABASE_TYPES)[number];

export const DATABASE_EDITIONS = [
    'supabase',
    'timescale',
    'mysql_5_7',
    'sql_server_2016_and_below',
    'cloudflare_d1',
] as const;

export type DatabaseEdition = (typeof DATABASE_EDITIONS)[number];

/** Which editions each database type accepts (data-format 3.1). */
const EDITIONS_BY_TYPE: Partial<Record<DatabaseType, DatabaseEdition[]>> = {
    postgresql: ['supabase', 'timescale'],
    mysql: ['mysql_5_7'],
    sql_server: ['sql_server_2016_and_below'],
    sqlite: ['cloudflare_d1'],
};

export function isDatabaseType(value: unknown): value is DatabaseType {
    return (
        typeof value === 'string' &&
        (DATABASE_TYPES as readonly string[]).includes(value)
    );
}

export function isDatabaseEdition(value: unknown): value is DatabaseEdition {
    return (
        typeof value === 'string' &&
        (DATABASE_EDITIONS as readonly string[]).includes(value)
    );
}

export function editionsFor(type: DatabaseType): DatabaseEdition[] {
    return EDITIONS_BY_TYPE[type] ?? [];
}

/** True when `edition` may be used with `type`. */
export function editionFits(
    type: DatabaseType,
    edition: DatabaseEdition
): boolean {
    return editionsFor(type).includes(edition);
}

/** Facts about a database type that the model itself needs. */
export interface DatabaseTraits {
    /** schema used for a new table; undefined where there is none */
    defaultSchema?: string;
    /** true when tables belong to schemas */
    hasSchemas: boolean;
    /** true when a column may be an array */
    hasArrays: boolean;
    /** true when the database has user-defined enum or composite types */
    hasUserTypes: boolean;
    /** true when an index may choose its method (btree, hash, gin) */
    hasIndexMethods: boolean;
    /** type given to a new key or column */
    defaultColumnType: string;
}

const SCHEMA_DATABASES: DatabaseType[] = ['postgresql', 'sql_server', 'oracle'];

const DEFAULT_SCHEMAS: Partial<Record<DatabaseType, string>> = {
    postgresql: 'public',
    sql_server: 'dbo',
};

export function traitsOf(type: DatabaseType): DatabaseTraits {
    return {
        defaultSchema: DEFAULT_SCHEMAS[type],
        hasSchemas: SCHEMA_DATABASES.includes(type),
        hasArrays: type === 'postgresql',
        hasUserTypes: type === 'postgresql',
        hasIndexMethods: type === 'postgresql',
        defaultColumnType:
            type === 'sqlite'
                ? 'integer'
                : type === 'oracle'
                  ? 'number'
                  : 'bigint',
    };
}
