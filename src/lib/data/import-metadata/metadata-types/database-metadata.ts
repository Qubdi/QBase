import { z } from 'zod';

// The JSON that the metadata scripts and the server's introspection produce.
// The server and the Docker build import this file by its path, so the path
// and the exported names are fixed (owner decision 3).

/** A flag that some scripts write as 0/1. */
const flag = z.union([z.boolean(), z.literal(0), z.literal(1)]);

const tableRow = z.object({
    schema: z.string(),
    table: z.string(),
    rows: z.number().nullish(),
    type: z.string().nullish(),
    engine: z.string().nullish(),
    collation: z.string().nullish(),
    comment: z.string().nullish(),
});

const viewRow = z.object({
    schema: z.string(),
    view_name: z.string(),
    /** base64: UTF-8, or UTF-16LE for SQL Server */
    view_definition: z.string().nullish(),
});

const columnRow = z.object({
    schema: z.string(),
    table: z.string(),
    name: z.string(),
    type: z.string(),
    ordinal_position: z.number(),
    nullable: flag,
    character_maximum_length: z.string().nullish(),
    precision: z
        .object({
            precision: z.number().nullable(),
            scale: z.number().nullable(),
        })
        .nullish(),
    default: z.string().nullish(),
    collation: z.string().nullish(),
    comment: z.string().nullish(),
    is_identity: z.boolean().nullish(),
    is_array: z.boolean().nullish(),
});

const primaryKeyRow = z.object({
    schema: z.string(),
    table: z.string(),
    column: z.string(),
    pk_def: z.string(),
});

const foreignKeyRow = z.object({
    schema: z.string(),
    table: z.string(),
    column: z.string(),
    foreign_key_name: z.string(),
    reference_schema: z.string().nullish(),
    reference_table: z.string(),
    reference_column: z.string(),
    fk_def: z.string(),
});

const indexRow = z.object({
    schema: z.string(),
    table: z.string(),
    name: z.string(),
    column: z.string(),
    index_type: z.string(),
    cardinality: z.number().nullish(),
    size: z.number().nullish(),
    unique: flag,
    direction: z.string(),
    column_position: z.number(),
});

const checkRow = z.object({
    schema: z.string(),
    table: z.string(),
    expression: z.string(),
});

const customTypeRow = z.object({
    schema: z.string(),
    type: z.string(),
    kind: z.enum(['enum', 'composite']),
    values: z.array(z.string()).nullish(),
    fields: z
        .array(z.object({ field: z.string(), type: z.string() }))
        .nullish(),
});

export const DatabaseMetadata = z.object({
    database_name: z.string(),
    version: z.string(),
    tables: z.array(tableRow),
    views: z.array(viewRow),
    columns: z.array(columnRow),
    pk_info: z.array(primaryKeyRow),
    fk_info: z.array(foreignKeyRow),
    indexes: z.array(indexRow),
    check_constraints: z.array(checkRow).optional(),
    custom_types: z.array(customTypeRow).optional(),
});

export type DatabaseMetadata = z.infer<typeof DatabaseMetadata>;
