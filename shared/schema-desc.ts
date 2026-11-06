// Canonical, dependency-free description of a schema. Both a QBase diagram
// and a live database introspection are converted to this form so they can be
// compared (re-sync, drift detection) and linted with one set of code that
// runs in the browser, in the server and in the CLI.

export interface ColumnDesc {
    name: string;
    /** canonical type name, arrays as "integer[]" */
    type: string;
    nullable: boolean;
    primaryKey: boolean;
    unique: boolean;
    default: string | null;
    length: string | null;
    precision: number | null;
    scale: number | null;
    identity: boolean;
    comment: string | null;
    /** id of the matching QBase field (diagram side only) */
    id?: string;
}

export interface IndexDesc {
    name: string;
    unique: boolean;
    columns: string[];
    id?: string;
}

export interface TableDesc {
    /** "schema.table", the table's identity in a database */
    key: string;
    schema: string;
    name: string;
    isView: boolean;
    comment: string | null;
    columns: ColumnDesc[];
    indexes: IndexDesc[];
    /** id of the matching QBase table (diagram side only) */
    id?: string;
}

export interface RelationshipDesc {
    name: string;
    /** the table that holds the foreign key */
    fromTable: string;
    fromColumns: string[];
    /** the referenced table */
    toTable: string;
    toColumns: string[];
    id?: string;
}

export interface SchemaDesc {
    tables: TableDesc[];
    relationships: RelationshipDesc[];
}

export const tableKey = (schema: string | null | undefined, name: string) =>
    `${schema ?? ''}.${name}`;

// --- type canonicalisation ---------------------------------------------------

const ALIASES: Record<string, string> = {
    int: 'integer',
    int4: 'integer',
    int8: 'bigint',
    int2: 'smallint',
    serial: 'integer',
    serial4: 'integer',
    bigserial: 'bigint',
    serial8: 'bigint',
    smallserial: 'smallint',
    float8: 'double precision',
    float4: 'real',
    float: 'double precision',
    bool: 'boolean',
    bpchar: 'char',
    character: 'char',
    'character varying': 'varchar',
    decimal: 'numeric',
    'timestamp without time zone': 'timestamp',
    'timestamp with time zone': 'timestamptz',
    'time without time zone': 'time',
    'time with time zone': 'timetz',
};

export function canonicalType(raw: string): string {
    const lower = raw
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/_/g, ' ');
    // "character_varying" (a QBase type id) and "character varying" are the same
    const arrays = lower.match(/(\[\])+$/)?.[0] ?? '';
    const base = lower.slice(0, lower.length - arrays.length).trim();
    return `${ALIASES[base] ?? base}${arrays}`;
}

// --- conversion from an introspection (QBase's metadata format) -----------

export interface MetadataLike {
    tables: Array<{
        schema: string;
        table: string;
        comment?: string | null;
    }>;
    views?: Array<{ schema: string; view_name: string }>;
    columns: Array<{
        schema: string;
        table: string;
        name: string;
        type: string;
        ordinal_position: number;
        nullable: boolean | number;
        character_maximum_length?: string | null;
        precision?: { precision: number | null; scale: number | null } | null;
        default?: string | null;
        comment?: string | null;
        is_identity?: boolean | null;
        is_array?: boolean | null;
    }>;
    pk_info: Array<{ schema: string; table: string; column: string }>;
    indexes: Array<{
        schema: string;
        table: string;
        name: string;
        column: string;
        unique: boolean | number;
        column_position: number;
    }>;
    fk_info: Array<{
        schema: string;
        table: string;
        column: string;
        foreign_key_name: string;
        reference_schema?: string | null;
        reference_table: string;
        reference_column: string;
    }>;
}

const lengthOrNull = (v: string | null | undefined) =>
    v && v !== 'null' ? String(v) : null;

export function metadataToDesc(meta: MetadataLike): SchemaDesc {
    // QBase lists views inside `tables` as well; `views` names them
    const viewKeys = new Set(
        (meta.views ?? []).map((v) => tableKey(v.schema, v.view_name))
    );
    const tableInfos = meta.tables.map((t) => ({
        schema: t.schema,
        name: t.table,
        isView: viewKeys.has(tableKey(t.schema, t.table)),
        comment: t.comment ?? null,
    }));
    // views that only appear in `views` still count
    const known = new Set(tableInfos.map((t) => tableKey(t.schema, t.name)));
    for (const v of meta.views ?? []) {
        if (!known.has(tableKey(v.schema, v.view_name))) {
            tableInfos.push({
                schema: v.schema,
                name: v.view_name,
                isView: true,
                comment: null,
            });
        }
    }

    // Rows are grouped by table once. Filtering every list for every table
    // would read each row once per table: quadratic on a big schema.
    const rowKey = (schema: string, table: string) => `${schema}\u0000${table}`;
    const groupByTable = <T extends { schema: string; table: string }>(
        rows: T[]
    ) => {
        const groups = new Map<string, T[]>();
        for (const row of rows) {
            const k = rowKey(row.schema, row.table);
            const group = groups.get(k);
            if (group) group.push(row);
            else groups.set(k, [row]);
        }
        return groups;
    };
    const pkRows = groupByTable(meta.pk_info);
    const indexRows = groupByTable(meta.indexes);
    const columnRows = groupByTable(meta.columns);

    const tables: TableDesc[] = tableInfos.map((info) => {
        const key = tableKey(info.schema, info.name);
        const mine = rowKey(info.schema, info.name);

        const pk = new Set((pkRows.get(mine) ?? []).map((p) => p.column));

        // group index rows by index name, ordered by position
        const byName = new Map<string, typeof meta.indexes>();
        for (const row of indexRows.get(mine) ?? []) {
            const group = byName.get(row.name);
            if (group) group.push(row);
            else byName.set(row.name, [row]);
        }
        const realColumns = new Set(
            (columnRows.get(mine) ?? []).map((c) => c.name)
        );
        const indexes: IndexDesc[] = [...byName.entries()]
            // expression indexes (lower(email)) cannot be drawn in QBase, so
            // they are left out on this side just as the importer leaves them out
            .filter(([, rows]) => rows.every((r) => realColumns.has(r.column)))
            .map(([name, rows]) => {
                const ordered = [...rows].sort(
                    (a, b) => a.column_position - b.column_position
                );
                return {
                    name,
                    unique: Boolean(ordered[0].unique),
                    columns: ordered.map((r) => r.column),
                };
            });
        const uniqueSingles = new Set(
            indexes
                .filter((i) => i.unique && i.columns.length === 1)
                .map((i) => i.columns[0])
        );

        const columns = [...(columnRows.get(mine) ?? [])]
            .sort((a, b) => a.ordinal_position - b.ordinal_position)
            .map<ColumnDesc>((c) => ({
                name: c.name,
                type: canonicalType(c.type) + (c.is_array ? '[]' : ''),
                nullable: Boolean(c.nullable),
                primaryKey: pk.has(c.name),
                unique: uniqueSingles.has(c.name),
                default: c.default ? c.default : null,
                length: lengthOrNull(c.character_maximum_length),
                precision: c.precision?.precision ?? null,
                scale: c.precision?.scale ?? null,
                identity: Boolean(c.is_identity),
                comment: c.comment ? c.comment : null,
            }));

        return {
            key,
            schema: info.schema,
            name: info.name,
            isView: info.isView,
            comment: info.comment ? info.comment : null,
            columns,
            indexes: info.isView ? [] : indexes,
        };
    });

    // QBase keeps one relationship per foreign key column pair, so do the same
    const relationships: RelationshipDesc[] = meta.fk_info.map((fk) => ({
        name: fk.foreign_key_name,
        fromTable: tableKey(fk.schema, fk.table),
        fromColumns: [fk.column],
        toTable: tableKey(fk.reference_schema ?? fk.schema, fk.reference_table),
        toColumns: [fk.reference_column],
    }));

    return { tables, relationships };
}

// --- conversion from a QBase diagram (works on plain JSON too) ------------

export interface DiagramLike {
    tables?: Array<{
        id: string;
        name: string;
        schema?: string | null;
        isView?: boolean;
        comments?: string | null;
        fields: Array<{
            id: string;
            name: string;
            type: { id?: string; name: string };
            primaryKey: boolean;
            unique: boolean;
            nullable: boolean;
            increment?: boolean | null;
            isArray?: boolean | null;
            characterMaximumLength?: string | null;
            precision?: number | null;
            scale?: number | null;
            default?: string | null;
            comments?: string | null;
        }>;
        indexes?: Array<{
            id: string;
            name: string;
            unique: boolean;
            fieldIds: string[];
        }>;
    }>;
    relationships?: Array<{
        id: string;
        name: string;
        sourceTableId: string;
        targetTableId: string;
        sourceFieldId: string;
        targetFieldId: string;
    }>;
}

export function diagramToDesc(diagram: DiagramLike): SchemaDesc {
    const dTables = diagram.tables ?? [];
    const tableById = new Map(dTables.map((t) => [t.id, t]));
    const keyOf = (t: { schema?: string | null; name: string }) =>
        tableKey(t.schema, t.name);

    const tables: TableDesc[] = dTables.map((t) => {
        const fieldName = new Map(t.fields.map((f) => [f.id, f.name]));
        const columns = t.fields.map<ColumnDesc>((f) => ({
            name: f.name,
            type: canonicalType(f.type.name) + (f.isArray ? '[]' : ''),
            nullable: f.nullable,
            primaryKey: f.primaryKey,
            unique: f.unique,
            default: f.default ? f.default : null,
            length:
                f.characterMaximumLength && f.characterMaximumLength !== 'null'
                    ? String(f.characterMaximumLength)
                    : null,
            precision: f.precision ?? null,
            scale: f.scale ?? null,
            identity: Boolean(f.increment),
            comment: f.comments ? f.comments : null,
            id: f.id,
        }));
        const indexes = (t.indexes ?? [])
            // an index on an expression has no field to point at; the database
            // side leaves such indexes out too
            .filter(
                (i) =>
                    i.fieldIds.length > 0 &&
                    i.fieldIds.every((id) => fieldName.has(id))
            )
            .map<IndexDesc>((i) => ({
                name: i.name,
                unique: i.unique,
                columns: i.fieldIds.map((id) => fieldName.get(id) as string),
                id: i.id,
            }));
        return {
            key: keyOf(t),
            schema: t.schema ?? '',
            name: t.name,
            isView: Boolean(t.isView),
            comment: t.comments ? t.comments : null,
            columns,
            indexes: t.isView ? [] : indexes,
            id: t.id,
        };
    });

    const relationships: RelationshipDesc[] = [];
    for (const r of diagram.relationships ?? []) {
        // QBase's source is the referenced table, the target holds the foreign key
        const to = tableById.get(r.sourceTableId);
        const from = tableById.get(r.targetTableId);
        if (!to || !from) continue;
        const toCol = to.fields.find((f) => f.id === r.sourceFieldId)?.name;
        const fromCol = from.fields.find((f) => f.id === r.targetFieldId)?.name;
        if (!toCol || !fromCol) continue;
        relationships.push({
            name: r.name,
            fromTable: keyOf(from),
            fromColumns: [fromCol],
            toTable: keyOf(to),
            toColumns: [toCol],
            id: r.id,
        });
    }

    return { tables, relationships };
}
