import type { DatabaseEdition, DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import type { RandomInt } from '@/core/model/ids';
import type { KeyMethod } from '@/core/model/key';
import { isKeyMethod } from '@/core/model/key';
import { dialectFor } from '@/dialects/registry';
import type { Diagnostic } from '@/dialects/script-model';
import type { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import { DesignBuilder } from '../shared/design-builder';
import type {
    ColumnSpec,
    IndexSpec,
    TableSpec,
} from '../shared/design-builder';
import { createRelationshipsFromMetadata } from './relationships';
import { decodeDefinition, tablesReadBy } from './view-sources';

export interface MetadataLoadOptions {
    databaseType: DatabaseType;
    databaseMetadata: DatabaseMetadata;
    databaseEdition?: DatabaseEdition;
    /** name used when the metadata has no database name */
    fallbackName?: string;
    now?: number;
    random?: RandomInt;
}

export interface MetadataLoadResult {
    design: Design;
    diagnostics: Diagnostic[];
}

const blankSchema = (schema: string | null | undefined): string | undefined =>
    schema && schema.trim() !== '' ? schema : undefined;
const keyOf = (schema: string | undefined, name: string): string =>
    `${schema ?? ''}\u0000${name}`;
const truthy = (v: boolean | 0 | 1): boolean => v === true || v === 1;

/** How a database spells an index type that QBase names another way. */
const METHOD_NAMES: Readonly<Record<string, KeyMethod>> = {
    'clustered columnstore': 'columnstore',
    'nonclustered columnstore': 'columnstore',
    'nonclustered hash': 'nonclustered',
    rtree: 'spatial',
};

function lengthOf(text: string | null | undefined): number | 'max' | undefined {
    if (text === null || text === undefined || text === '') return undefined;
    if (text === '-1' || text.toLowerCase() === 'max') return 'max';
    const n = Number(text);
    return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** The names databases give the index behind a primary key. */
const PRIMARY_INDEX_NAME = /^(?:primary|pk_.*|.*_pkey|.*_pk|sys_c\d+)$/i;

/**
 * For metadata with no primary flag: the one unique index on exactly the
 * primary-key columns that is the key's own, by the names databases give it.
 */
function pickByName<
    T extends {
        name: string;
        unique: boolean;
        where?: string;
        columns: { name: string }[];
    },
>(all: T[], pk: string[]): T | undefined {
    const onPk = all.filter(
        (raw) =>
            raw.unique &&
            raw.where === undefined &&
            pk.length > 0 &&
            raw.columns.length === pk.length &&
            raw.columns.every((c) => pk.includes(c.name))
    );
    return onPk.find((raw) => PRIMARY_INDEX_NAME.test(raw.name)) ?? onPk[0];
}

/** Builds a design from the metadata JSON (IMP-056 to IMP-065). */
export function loadFromDatabaseMetadata(
    options: MetadataLoadOptions
): MetadataLoadResult {
    const meta = options.databaseMetadata;
    const synonyms = dialectFor(options.databaseType).typeSynonyms ?? {};
    const diagnostics: Diagnostic[] = [];
    const builder = new DesignBuilder({
        databaseType: options.databaseType,
        databaseEdition: options.databaseEdition,
        name: meta.database_name.trim() || options.fallbackName || 'Diagram 1',
        now: options.now,
        random: options.random,
    });

    for (const t of meta.custom_types ?? []) {
        builder.addUserType({
            schema: blankSchema(t.schema),
            name: t.type,
            kind: t.kind,
            ...(t.kind === 'enum'
                ? { values: t.values ?? [] }
                : {
                      members: (t.fields ?? []).map((f) => ({
                          name: f.field,
                          type: f.type,
                      })),
                  }),
        });
    }

    const pkColumns = new Map<string, Set<string>>();
    for (const p of meta.pk_info) {
        const k = keyOf(blankSchema(p.schema), p.table);
        pkColumns.set(k, (pkColumns.get(k) ?? new Set()).add(p.column));
    }

    // indexes grouped by table, then by name, columns in position order
    interface Raw {
        name: string;
        unique: boolean;
        /** the metadata's own word that this is the primary key's index */
        primary?: boolean;
        type: string;
        columns: { name: string; position: number; descending: boolean }[];
        where?: string;
    }
    const rawIndexes = new Map<string, Map<string, Raw>>();
    for (const i of meta.indexes) {
        const tk = keyOf(blankSchema(i.schema), i.table);
        const group = rawIndexes.get(tk) ?? new Map<string, Raw>();
        const found = group.get(i.name) ?? {
            name: i.name,
            unique: truthy(i.unique),
            type: i.index_type,
            columns: [],
        };
        if (i.primary !== undefined) found.primary = truthy(i.primary);
        found.columns.push({
            name: i.column,
            position: i.column_position,
            descending: i.direction.toLowerCase() === 'desc',
        });
        if (i.where?.trim()) found.where = i.where.trim();
        group.set(i.name, found);
        rawIndexes.set(tk, group);
    }

    const checks = new Map<string, string[]>();
    for (const c of meta.check_constraints ?? []) {
        const k = keyOf(blankSchema(c.schema), c.table);
        checks.set(k, [...(checks.get(k) ?? []), c.expression]);
    }

    const columnsOf = new Map<string, ColumnSpec[]>();
    const sortedColumns = [...meta.columns].sort(
        (a, b) => a.ordinal_position - b.ordinal_position
    );
    for (const c of sortedColumns) {
        const k = keyOf(blankSchema(c.schema), c.table);
        const list = columnsOf.get(k) ?? [];
        if (list.some((x) => x.name === c.name)) continue;
        const lower = c.type.toLowerCase().trim();
        const spec: ColumnSpec = {
            name: c.name,
            typeName: synonyms[lower] ?? lower,
            nullable: truthy(c.nullable),
            isArray: c.is_array ? true : undefined,
            numbered: c.is_identity ? true : undefined,
            default: c.default ?? undefined,
            collation: c.collation ?? undefined,
            comment: c.comment ?? undefined,
            domain: c.domain ?? undefined,
        };
        if (c.generated && c.generated.expression.trim() !== '') {
            spec.generated = c.generated;
            // a computed column has no default of its own
            spec.default = undefined;
        }
        const length = lengthOf(c.character_maximum_length);
        if (length !== undefined) spec.length = length;
        if (c.precision?.precision) spec.precision = c.precision.precision;
        if (c.precision?.scale) spec.scale = c.precision.scale;
        spec.primary = pkColumns.get(k)?.has(c.name) ?? false;
        list.push(spec);
        columnsOf.set(k, list);
    }

    const specFor = (
        schema: string | undefined,
        name: string,
        extra: Partial<TableSpec>
    ): TableSpec => {
        const k = keyOf(schema, name);
        const columns = columnsOf.get(k) ?? [];
        const indexes: IndexSpec[] = [];
        let primaryKeyName: string | undefined;
        const pk = columns.filter((c) => c.primary).map((c) => c.name);
        const all = [...(rawIndexes.get(k)?.values() ?? [])];
        for (const raw of all)
            raw.columns.sort((a, b) => a.position - b.position);
        // Only the index behind the primary key is the key's own; any other
        // unique index on the same columns is the user's and stays an index
        // (CLI-039). Metadata that says which index is primary is believed;
        // older metadata has no flag, so only then do the conventional names
        // pick one unique index on the key columns.
        const flagged = all.some((raw) => raw.primary !== undefined);
        const keysOwn = flagged
            ? all.find((raw) => raw.primary === true)
            : pickByName(all, pk);
        for (const raw of all) {
            const ordered = raw.columns;
            const names = ordered.map((c) => c.name);
            if (raw === keysOwn) {
                primaryKeyName ??= raw.name;
                continue;
            }
            const lowerType =
                METHOD_NAMES[raw.type.toLowerCase()] ?? raw.type.toLowerCase();
            const method: KeyMethod | undefined = isKeyMethod(lowerType)
                ? lowerType
                : undefined;
            indexes.push({
                name: raw.name,
                unique: raw.unique,
                columns: names,
                method,
                descending: ordered
                    .filter((c) => c.descending)
                    .map((c) => c.name),
                where: raw.where,
            });
            if (raw.unique && names.length === 1 && raw.where === undefined) {
                const col = columns.find((c) => c.name === names[0]);
                if (col) col.unique = true;
            }
        }
        return {
            name,
            schema,
            columns,
            indexes,
            primaryKeyName,
            checks: checks.get(k) ?? [],
            ...extra,
        };
    };

    const viewKeys = new Set(
        meta.views.map((v) => keyOf(blankSchema(v.schema), v.view_name))
    );
    const comments = new Map<string, string>();
    for (const t of meta.tables) {
        const schema = blankSchema(t.schema);
        const k = keyOf(schema, t.table);
        if (t.comment) comments.set(k, t.comment);
        const isView =
            viewKeys.has(k) || (t.type ?? '').toUpperCase() === 'VIEW';
        if (isView) continue;
        if (builder.hasTable(schema, t.table)) continue;
        builder.addTable(
            specFor(schema, t.table, { comment: t.comment ?? undefined })
        );
    }
    const utf16 = options.databaseType === 'sql_server';
    const decoded: { schema?: string; name: string; text: string }[] = [];
    const viewsSeen = new Set<string>();
    const addView = (
        schema: string | undefined,
        name: string,
        definition?: string | null
    ) => {
        const k = keyOf(schema, name);
        if (viewsSeen.has(k)) return;
        viewsSeen.add(k);
        let text = '';
        if (definition) {
            try {
                text = decodeDefinition(definition, utf16);
            } catch {
                text = '';
            }
        }
        builder.addTable(
            specFor(schema, name, {
                view: true,
                materialized: /materialized/i.test(text),
            })
        );
        if (text) decoded.push({ schema, name, text });
    };
    for (const v of meta.views)
        addView(blankSchema(v.schema), v.view_name, v.view_definition);
    for (const t of meta.tables)
        if ((t.type ?? '').toUpperCase() === 'VIEW')
            addView(blankSchema(t.schema), t.table);

    for (const view of decoded)
        for (const ref of tablesReadBy(view.text))
            builder.addDependency(
                { schema: ref.schema ?? view.schema, table: ref.name },
                { schema: view.schema, table: view.name }
            );

    const links = createRelationshipsFromMetadata(meta.fk_info, {
        hasColumn: (s, t, c) => builder.hasColumn(s, t, c),
    });
    if (links.length < meta.fk_info.length)
        diagnostics.push({
            severity: 'warning',
            message: `${meta.fk_info.length - links.length} foreign key row(s) dropped: a table or column is not in the import.`,
        });
    for (const link of links) builder.addLink(link);
    // what the builder had to leave out (an index on an expression, say)
    diagnostics.push(...builder.diagnostics);
    return { design: builder.build(), diagnostics };
}
