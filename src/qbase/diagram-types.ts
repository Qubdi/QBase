/**
 * The saved-diagram shape that the QBase code (sync, lint, drift, re-sync,
 * the server) reads and writes: the wire format of `rewrite/spec/data-format.md`
 * section 3, with the two top-level dates held as `Date`. It is a view of the
 * editor's own model (`@/core/model`): `diagram-convert.ts` is the only place
 * that turns one into the other, through `@/core/wire`.
 *
 * The string values of the enums are stored on the server and read by the
 * shared description code; do not rename them.
 */

export enum DatabaseType {
    GENERIC = 'generic',
    POSTGRESQL = 'postgresql',
    MYSQL = 'mysql',
    SQL_SERVER = 'sql_server',
    MARIADB = 'mariadb',
    SQLITE = 'sqlite',
    CLICKHOUSE = 'clickhouse',
    COCKROACHDB = 'cockroachdb',
    ORACLE = 'oracle',
}

export enum DatabaseEdition {
    POSTGRESQL_SUPABASE = 'supabase',
    POSTGRESQL_TIMESCALE = 'timescale',
    MYSQL_5_7 = 'mysql_5_7',
    SQL_SERVER_2016_AND_BELOW = 'sql_server_2016_and_below',
    SQLITE_CLOUDFLARE_D1 = 'cloudflare_d1',
}

export enum DBCustomTypeKind {
    enum = 'enum',
    composite = 'composite',
}

export type Cardinality = 'one' | 'many';

/** The data type of a column: `id` is the catalogue key, `name` the display text. */
export interface DBFieldType {
    id: string;
    name: string;
}

export interface DBField {
    id: string;
    name: string;
    type: DBFieldType;
    primaryKey: boolean;
    unique: boolean;
    nullable: boolean;
    increment?: boolean | null;
    isArray?: boolean | null;
    createdAt: number;
    /** text on the wire, so it can hold `max` */
    characterMaximumLength?: string | null;
    precision?: number | null;
    scale?: number | null;
    default?: string | null;
    collation?: string | null;
    comments?: string | null;
    check?: string | null;
}

export interface DBIndex {
    id: string;
    name: string;
    unique: boolean;
    fieldIds: string[];
    createdAt: number;
    type?: string;
    isPrimaryKey?: boolean | null;
    comments?: string | null;
}

export interface DBCheckConstraint {
    id: string;
    expression: string;
    createdAt: number;
}

export interface DBTable {
    id: string;
    name: string;
    schema?: string | null;
    x: number;
    y: number;
    fields: DBField[];
    indexes: DBIndex[];
    checkConstraints?: DBCheckConstraint[] | null;
    color: string;
    isView: boolean;
    isMaterializedView?: boolean | null;
    createdAt: number;
    width?: number | null;
    comments?: string | null;
    order?: number | null;
    expanded?: boolean | null;
    parentAreaId?: string | null;
}

export interface DBRelationship {
    id: string;
    name: string;
    sourceSchema?: string | null;
    sourceTableId: string;
    targetSchema?: string | null;
    targetTableId: string;
    sourceFieldId: string;
    targetFieldId: string;
    sourceCardinality: Cardinality;
    targetCardinality: Cardinality;
    createdAt: number;
}

export interface DBDependency {
    id: string;
    schema?: string | null;
    tableId: string;
    dependentSchema?: string | null;
    dependentTableId: string;
    createdAt: number;
}

export interface DBCustomType {
    id: string;
    schema?: string | null;
    name: string;
    kind: DBCustomTypeKind | 'enum' | 'composite';
    values?: string[] | null;
    fields?: { field: string; type: string }[] | null;
    order?: number | null;
}

export interface Area {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    order?: number;
}

export interface Note {
    id: string;
    content: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    order?: number;
}

export interface Diagram {
    id: string;
    name: string;
    databaseType: DatabaseType;
    databaseEdition?: DatabaseEdition;
    tables?: DBTable[];
    relationships?: DBRelationship[];
    dependencies?: DBDependency[];
    areas?: Area[];
    customTypes?: DBCustomType[];
    notes?: Note[];
    createdAt: Date;
    updatedAt: Date;
    /** format version written by the serialiser; absent on diagrams made by hand */
    qbaseFormat?: number;
}

/** Databases whose tables belong to schemas (spec C5). */
export const databasesWithSchemas: DatabaseType[] = [
    DatabaseType.POSTGRESQL,
    DatabaseType.COCKROACHDB,
    DatabaseType.SQL_SERVER,
    DatabaseType.CLICKHOUSE,
    DatabaseType.ORACLE,
];

export const databaseTypeToLabelMap: Record<DatabaseType, string> = {
    [DatabaseType.GENERIC]: 'Generic',
    [DatabaseType.POSTGRESQL]: 'PostgreSQL',
    [DatabaseType.MYSQL]: 'MySQL',
    [DatabaseType.SQL_SERVER]: 'SQL Server',
    [DatabaseType.MARIADB]: 'MariaDB',
    [DatabaseType.SQLITE]: 'SQLite',
    [DatabaseType.CLICKHOUSE]: 'ClickHouse',
    [DatabaseType.COCKROACHDB]: 'CockroachDB',
    [DatabaseType.ORACLE]: 'Oracle',
};
