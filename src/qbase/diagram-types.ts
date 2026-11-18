import { z } from 'zod';

/*
 * The saved-diagram shape QBase code works with (sync, lint, drift, re-sync,
 * the server). Each part is a small zod schema; the exported types are
 * inferred from them, so the shape is written down once. Only the key names
 * and string values are fixed by the saved format (spec data-format.md s3);
 * everything else here is ours. `diagram-convert.ts` is the single place that
 * moves between this shape and the editor model, through `@/core/wire`.
 */

/** Builds a value table `{ NAME: 'text' }` and the union of its values. */
const valueTable = <const T extends Record<string, string>>(table: T) => table;

export const DatabaseType = valueTable({
    POSTGRESQL: 'postgresql',
    MYSQL: 'mysql',
    SQL_SERVER: 'sql_server',
    MARIADB: 'mariadb',
    SQLITE: 'sqlite',
    ORACLE: 'oracle',
});
export type DatabaseType = (typeof DatabaseType)[keyof typeof DatabaseType];

export const DatabaseEdition = valueTable({
    POSTGRESQL_SUPABASE: 'supabase',
    POSTGRESQL_TIMESCALE: 'timescale',
    MYSQL_5_7: 'mysql_5_7',
    SQL_SERVER_2016_AND_BELOW: 'sql_server_2016_and_below',
    SQLITE_CLOUDFLARE_D1: 'cloudflare_d1',
});
export type DatabaseEdition =
    (typeof DatabaseEdition)[keyof typeof DatabaseEdition];

export const DBCustomTypeKind = valueTable({
    enum: 'enum',
    composite: 'composite',
    alias: 'alias',
});
export type DBCustomTypeKind =
    (typeof DBCustomTypeKind)[keyof typeof DBCustomTypeKind];

// ---- small building blocks

/** A value that may also be saved as `null`, meaning "not set". */
const maybe = <S extends z.ZodType>(schema: S) => schema.nullish();
const id = z.string();
const stamp = z.number();
const text = maybe(z.string());
const flag = maybe(z.boolean());
const box = { x: z.number(), y: z.number() };
const extent = { ...box, width: z.number(), height: z.number() };

const cardinality = z.enum(['one', 'many']);
export type Cardinality = z.infer<typeof cardinality>;

// ---- what lives inside a table

const fieldType = z.object({ id, name: z.string() });
const field = z.object({
    id,
    name: z.string(),
    type: fieldType,
    // constraints
    primaryKey: z.boolean(),
    unique: z.boolean(),
    nullable: z.boolean(),
    increment: flag,
    isArray: flag,
    // size and shape; the length is text so it can hold "max"
    characterMaximumLength: text,
    precision: maybe(z.number()),
    scale: maybe(z.number()),
    // free text
    default: text,
    collation: text,
    comments: text,
    check: text,
    // a domain-typed column keeps the domain's name; a computed column its expression
    domain: text,
    generatedExpression: text,
    generatedStored: flag,
    createdAt: stamp,
});
export type DBField = z.infer<typeof field>;

const index = z.object({
    id,
    name: z.string(),
    fieldIds: z.array(id),
    unique: z.boolean(),
    type: z.string().optional(),
    isPrimaryKey: flag,
    // columns sorted high to low, and the predicate of a partial index
    descendingFieldIds: maybe(z.array(id)),
    where: text,
    comments: text,
    createdAt: stamp,
});
export type DBIndex = z.infer<typeof index>;

const checkConstraint = z.object({
    id,
    expression: z.string(),
    createdAt: stamp,
});
const table = z.object({
    id,
    name: z.string(),
    schema: text,
    ...box,
    width: maybe(z.number()),
    color: z.string(),
    isView: z.boolean(),
    isMaterializedView: flag,
    expanded: flag,
    parentAreaId: text,
    order: maybe(z.number()),
    comments: text,
    fields: z.array(field),
    indexes: z.array(index),
    checkConstraints: maybe(z.array(checkConstraint)),
    createdAt: stamp,
});
export type DBTable = z.infer<typeof table>;

// ---- things that join or sit beside tables

const relationship = z.object({
    id,
    name: z.string(),
    sourceTableId: id,
    sourceFieldId: id,
    sourceSchema: text,
    sourceCardinality: cardinality,
    targetTableId: id,
    targetFieldId: id,
    targetSchema: text,
    targetCardinality: cardinality,
    createdAt: stamp,
});
export type DBRelationship = z.infer<typeof relationship>;

const dependency = z.object({
    id,
    tableId: id,
    schema: text,
    dependentTableId: id,
    dependentSchema: text,
    createdAt: stamp,
});
const customType = z.object({
    id,
    name: z.string(),
    schema: text,
    kind: z.enum(['enum', 'composite', 'alias']),
    baseType: maybe(z.string()),
    values: maybe(z.array(z.string())),
    fields: maybe(z.array(z.object({ field: z.string(), type: z.string() }))),
    order: maybe(z.number()),
});
const area = z.object({
    id,
    name: z.string(),
    ...extent,
    color: z.string(),
    order: z.number().optional(),
});
export type Area = z.infer<typeof area>;

/** What a note is attached to: an area, a table or a column (a table's field). */
export const NoteAnchorType = valueTable({
    AREA: 'area',
    TABLE: 'table',
    FIELD: 'field',
});
export type NoteAnchorType =
    (typeof NoteAnchorType)[keyof typeof NoteAnchorType];

const note = z.object({
    id,
    content: z.string(),
    /** with an anchor, x and y are where the note is on the canvas now */
    ...extent,
    color: z.string(),
    order: z.number().optional(),
    anchorType: z
        .enum(Object.values(NoteAnchorType) as [NoteAnchorType])
        .optional(),
    anchorId: id.optional(),
});
export type Note = z.infer<typeof note>;

// ---- the whole diagram

/**
 * A saved diagram. The collections are optional in the type (old files lack
 * some) but QBase always fills them; the two dates are `Date` here and ISO
 * text in the saved JSON.
 */
export const diagramShape = z.object({
    id,
    name: z.string(),
    databaseType: z.enum(Object.values(DatabaseType) as [DatabaseType]),
    databaseEdition: z
        .enum(Object.values(DatabaseEdition) as [DatabaseEdition])
        .optional(),
    tables: z.array(table).optional(),
    relationships: z.array(relationship).optional(),
    dependencies: z.array(dependency).optional(),
    customTypes: z.array(customType).optional(),
    areas: z.array(area).optional(),
    notes: z.array(note).optional(),
    /** which tables are shown; absent when all are */
    filter: z
        .object({
            schemaIds: z.array(z.string()).optional(),
            tableIds: z.array(z.string()).optional(),
        })
        .optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
    /** the format version the serialiser writes; absent on hand-made diagrams */
    qbaseFormat: z.number().optional(),
});
export type Diagram = z.infer<typeof diagramShape>;

// ---- facts about databases

const LABELS: Record<DatabaseType, string> = {
    postgresql: 'PostgreSQL',
    mysql: 'MySQL',
    sql_server: 'SQL Server',
    mariadb: 'MariaDB',
    sqlite: 'SQLite',
    oracle: 'Oracle',
};

/** The name shown for each database in pickers. */
export const databaseTypeToLabelMap: Record<DatabaseType, string> = LABELS;
