import { collectionOf } from '@/core/model/collection';
import type { Column } from '@/core/model/column';
import type { DatabaseEdition, DatabaseType } from '@/core/model/database';
import { createDesign } from '@/core/model/defaults';
import type { Design } from '@/core/model/design';
import { TABLE_COLOR, VIEW_COLOR } from '@/core/model/entity';
import type { Entity } from '@/core/model/entity';
import type { RandomInt } from '@/core/model/ids';
import { newId } from '@/core/model/ids';
import type { Key, KeyMethod } from '@/core/model/key';
import type { Cardinality, Link } from '@/core/model/link';
import { syncPrimaryKey } from '@/core/model/primary-key';
import type { Rule } from '@/core/model/rule';
import type { UserType } from '@/core/model/user-type';
import { resolveTable, sameName } from '@/dialects/shared/names';
import type { Diagnostic } from '@/dialects/script-model';
import { cardinalityOf } from './cardinality';
import { layoutTables } from './layout';

export const MATERIALIZED_COLOR = '#7d7d7d';

export interface ColumnSpec {
    name: string;
    typeName: string;
    length?: number | 'max';
    precision?: number;
    scale?: number;
    isArray?: boolean;
    nullable: boolean;
    primary?: boolean;
    unique?: boolean;
    numbered?: boolean;
    default?: string;
    collation?: string;
    comment?: string;
    domain?: string;
    generated?: { expression: string; stored: boolean };
}

export interface IndexSpec {
    name: string;
    unique: boolean;
    columns: string[];
    /** names from `columns` that sort from high to low */
    descending?: string[];
    /** predicate of a partial index (no WHERE keyword) */
    where?: string;
    method?: KeyMethod;
    comment?: string;
}

export interface TableSpec {
    name: string;
    schema?: string;
    view?: boolean;
    materialized?: boolean;
    comment?: string;
    columns: ColumnSpec[];
    /** name of the primary key index, when the source gave one */
    primaryKeyName?: string;
    indexes: IndexSpec[];
    checks: string[];
}

export interface LinkSpec {
    name: string;
    /** given ends; otherwise decided from which columns identify a row */
    cardinality?: { source: Cardinality; target: Cardinality };
    from: { schema?: string; table: string; column: string };
    to: { schema?: string; table: string; column: string };
}

interface Built {
    entity: Entity;
    columns: Column[];
    keys: Key[];
    rules: Rule[];
    byName: Map<string, Column>;
    spec: TableSpec;
}

export interface BuilderOptions {
    databaseType: DatabaseType;
    databaseEdition?: DatabaseEdition;
    name: string;
    now?: number;
    random?: RandomInt;
    /** order tables by name, views last (IMP-042) */
    sort?: boolean;
}

/** `double precision` becomes the id `double_precision`. */
export function typeIdOf(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, '_');
}

/** Collects tables, links and types, then produces a laid-out Design. */
export class DesignBuilder {
    private readonly tables: Built[] = [];
    // the tables by folded name, in the order they were added: a lookup scans
    // the few that share the name, not every table (import was quadratic)
    private readonly byFoldedName = new Map<string, Built[]>();
    private readonly types: UserType[] = [];
    private readonly pendingDependencies: { reads: Built; view: Built }[] = [];
    private readonly pendingLinks: { link: LinkSpec; id: string }[] = [];
    private readonly now: number;
    /** problems met while collecting (an index that does not resolve, ...) */
    readonly diagnostics: Diagnostic[] = [];

    constructor(private readonly options: BuilderOptions) {
        this.now = options.now ?? Date.now();
    }

    private id(): string {
        return newId(this.options.random);
    }

    addUserType(type: Omit<UserType, 'id'>): void {
        this.types.push({ id: this.id(), ...type });
    }

    /** True when a table with this name exists in exactly this schema. */
    hasTable(schema: string | undefined, name: string): boolean {
        const ws = (schema ?? '').toLowerCase();
        return (this.byFoldedName.get(name.toLowerCase()) ?? []).some(
            (t) => (t.entity.schema ?? '').toLowerCase() === ws
        );
    }

    /** True when the name resolves (an unqualified name matches any schema). */
    resolves(schema: string | undefined, name: string): boolean {
        return this.find(schema, name) !== undefined;
    }

    /** True when a name without a schema matches tables of several schemas. */
    isAmbiguous(schema: string | undefined, name: string): boolean {
        return this.resolve(schema, name).ambiguous;
    }

    private resolve(schema: string | undefined, name: string) {
        // only a table whose name matches can win, so the candidates are enough
        return resolveTable(
            this.byFoldedName.get(name.toLowerCase()) ?? [],
            (t) => t.entity,
            { schema, name }
        );
    }

    private find(schema: string | undefined, name: string): Built | undefined {
        return this.resolve(schema, name).found;
    }

    private column(t: Built, name: string): Column | undefined {
        return (
            t.byName.get(name) ??
            [...t.byName.values()].find((c) => sameName(c.name, name))
        );
    }

    columnCount(schema: string | undefined, name: string): number {
        return this.find(schema, name)?.columns.length ?? 0;
    }

    hasColumn(
        schema: string | undefined,
        table: string,
        column: string
    ): boolean {
        const t = this.find(schema, table);
        return t ? this.column(t, column) !== undefined : false;
    }

    /** Names of the primary key columns of a table, in column order. */
    primaryColumns(schema: string | undefined, table: string): string[] {
        const t = this.find(schema, table);
        return t
            ? t.columns.filter((c) => c.primaryKey).map((c) => c.name)
            : [];
    }

    addTable(spec: TableSpec): void {
        const enumNames = new Set(this.types.map((t) => t.name));
        const columns: Column[] = [];
        const byName = new Map<string, Column>();
        for (const c of spec.columns) {
            if (byName.has(c.name)) {
                this.diagnostics.push({
                    severity: 'warning',
                    message: `Table ${spec.name}: a second field named ${c.name} was left out.`,
                });
                continue;
            }
            const lower = c.typeName.toLowerCase();
            const asUser = enumNames.has(c.typeName);
            const column: Column = {
                id: this.id(),
                name: c.name,
                type: asUser
                    ? { id: c.typeName, name: c.typeName }
                    : { id: typeIdOf(lower), name: lower },
                primaryKey: !!c.primary && !spec.view,
                unique: !!c.unique,
                nullable: c.nullable && !c.primary,
                createdAt: this.now,
            };
            if (c.numbered) column.increment = true;
            if (c.isArray) column.isArray = true;
            if (c.length !== undefined) column.length = c.length;
            if (c.precision !== undefined) column.precision = c.precision;
            if (c.scale !== undefined) column.scale = c.scale;
            if (c.default !== undefined && c.default !== '')
                column.default = c.default;
            if (c.collation) column.collation = c.collation;
            if (c.comment) column.comments = c.comment;
            if (c.domain) column.domain = c.domain;
            if (c.generated && c.generated.expression.trim() !== '')
                column.generated = { ...c.generated };
            columns.push(column);
            byName.set(c.name, column);
        }
        const keys: Key[] = [];
        for (const index of spec.indexes) {
            const members = index.columns
                .map(
                    (n) =>
                        byName.get(n) ??
                        columns.find((c) => sameName(c.name, n))
                )
                .filter((c): c is Column => c !== undefined);
            if (
                members.length === 0 ||
                members.length !== index.columns.length
            ) {
                this.diagnostics.push({
                    severity: 'warning',
                    message: `Index ${index.name} on ${spec.name} dropped: ${
                        members.length === 0
                            ? 'none of its columns'
                            : 'some of its columns'
                    } could not be found.`,
                });
                continue;
            }
            const key: Key = {
                id: this.id(),
                label: index.name,
                members: members.map((m) => m.id),
                distinct: index.unique,
                madeAt: this.now,
            };
            if (index.method) key.algorithm = index.method;
            const descending = members
                .filter((m) =>
                    (index.descending ?? []).some((n) => sameName(n, m.name))
                )
                .map((m) => m.id);
            if (descending.length > 0) key.descending = descending;
            if (index.where?.trim()) key.where = index.where.trim();
            if (index.comment) key.note = index.comment;
            keys.push(key);
        }
        const rules: Rule[] = spec.checks
            .filter((expression) => expression.trim() !== '')
            .map((expression) => ({
                id: this.id(),
                expression,
                createdAt: this.now,
            }));
        const entity: Entity = {
            id: this.id(),
            name: spec.name,
            kind: spec.view ? 'view' : 'table',
            x: 0,
            y: 0,
            color: spec.view
                ? spec.materialized
                    ? MATERIALIZED_COLOR
                    : VIEW_COLOR
                : TABLE_COLOR,
            createdAt: this.now,
            columnIds: columns.map((c) => c.id),
            keyIds: keys.map((k) => k.id),
            ruleIds: rules.map((r) => r.id),
        };
        if (spec.view && spec.materialized) entity.materialized = true;
        if (spec.schema) entity.schema = spec.schema;
        if (spec.comment) entity.comments = spec.comment;
        const built = { entity, columns, keys, rules, byName, spec };
        this.tables.push(built);
        const folded = entity.name.toLowerCase();
        const same = this.byFoldedName.get(folded);
        if (same) same.push(built);
        else this.byFoldedName.set(folded, [built]);
    }

    /** Adds a foreign key between two tables already added; false if an end is missing. */
    addLink(spec: LinkSpec): boolean {
        const a = this.find(spec.from.schema, spec.from.table);
        const b = this.find(spec.to.schema, spec.to.table);
        if (!a || !b) return false;
        if (
            !this.column(a, spec.from.column) ||
            !this.column(b, spec.to.column)
        )
            return false;
        for (const end of [spec.from, spec.to])
            if (this.isAmbiguous(end.schema, end.table))
                this.diagnostics.push({
                    severity: 'warning',
                    message: `Foreign key ${spec.name} names table ${end.table} without a schema and several schemas have it: the first was used.`,
                });
        this.pendingLinks.push({ link: spec, id: this.id() });
        return true;
    }

    /** Records that a view reads a table; false when either is unknown. */
    addDependency(
        read: { schema?: string; table: string },
        view: { schema?: string; table: string }
    ): boolean {
        const reads = this.find(read.schema, read.table);
        const viewBuilt = this.find(view.schema, view.table);
        if (!reads || !viewBuilt || reads === viewBuilt) return false;
        if (
            this.pendingDependencies.some(
                (d) => d.reads === reads && d.view === viewBuilt
            )
        )
            return false;
        this.pendingDependencies.push({ reads, view: viewBuilt });
        return true;
    }

    build(): Design {
        const o = this.options;
        let design = createDesign({
            name: o.name,
            databaseType: o.databaseType,
            databaseEdition: o.databaseEdition,
            now: this.now,
            random: o.random,
        });
        const sorted =
            o.sort === false
                ? this.tables
                : [...this.tables].sort(
                      (x, y) =>
                          Number(x.entity.kind === 'view') -
                              Number(y.entity.kind === 'view') ||
                          x.entity.name.localeCompare(y.entity.name)
                  );

        const columns: Record<string, Column> = {};
        const keys: Record<string, Key> = {};
        const rules: Record<string, Rule> = {};
        const entities: Entity[] = [];
        for (const t of sorted) {
            const taken = (id: string): boolean => id in keys;
            const synced = syncPrimaryKey(
                {
                    entity: t.entity,
                    columns: t.columns,
                    keys: t.keys,
                    rules: t.rules,
                },
                taken
            );
            let syncedKeys = synced.keys;
            if (t.spec.primaryKeyName)
                syncedKeys = syncedKeys.map((k) =>
                    k.pk ? { ...k, label: t.spec.primaryKeyName! } : k
                );
            synced.columns.forEach((c) => {
                columns[c.id] = c;
                t.byName.set(c.name, c);
            });
            syncedKeys.forEach((k) => (keys[k.id] = k));
            synced.rules.forEach((r) => (rules[r.id] = r));
            entities.push(synced.entity);
            t.entity = synced.entity;
            t.columns = synced.columns;
        }

        const links: Link[] = this.pendingLinks.flatMap(({ link, id }) => {
            const a = this.find(link.from.schema, link.from.table)!;
            const b = this.find(link.to.schema, link.to.table)!;
            const from = this.column(a, link.from.column)!;
            const to = this.column(b, link.to.column)!;
            const facts = (t: Built, c: Column) => ({
                identifiesRow:
                    c.unique ||
                    (c.primaryKey &&
                        t.columns.filter((x) => x.primaryKey).length === 1),
            });
            const card = link.cardinality
                ? link.cardinality.source === 'many' &&
                  link.cardinality.target === 'many'
                    ? { source: 'one' as const, target: 'many' as const }
                    : link.cardinality
                : cardinalityOf(facts(a, from), facts(b, to));
            const out: Link = {
                id,
                name: link.name,
                sourceEntityId: a.entity.id,
                sourceColumnId: from.id,
                targetEntityId: b.entity.id,
                targetColumnId: to.id,
                sourceCardinality: card.source,
                targetCardinality: card.target,
                createdAt: this.now,
            };
            if (a.entity.schema) out.sourceSchema = a.entity.schema;
            if (b.entity.schema) out.targetSchema = b.entity.schema;
            return [out];
        });

        const neighbours = new Map<string, string[]>();
        // pushed onto the list the map already holds: copying it for every
        // link makes a table with many links quadratic
        const addNeighbour = (id: string, other: string) => {
            const list = neighbours.get(id);
            if (list) list.push(other);
            else neighbours.set(id, [other]);
        };
        for (const l of links) {
            addNeighbour(l.sourceEntityId, l.targetEntityId);
            addNeighbour(l.targetEntityId, l.sourceEntityId);
        }
        const spots = layoutTables(
            entities.map((e) => ({
                id: e.id,
                group: e.schema ?? '',
                columnCount: e.columnIds.length,
                neighbours: neighbours.get(e.id) ?? [],
            }))
        );
        const placed = entities.map((e) => ({
            ...e,
            ...(spots.get(e.id) ?? { x: 0, y: 0 }),
        }));

        design = {
            ...design,
            entities: collectionOf(placed),
            columns,
            keys,
            rules,
            links: collectionOf(links),
            userTypes: collectionOf(this.types),
            dependencies: this.pendingDependencies.map(({ reads, view }) => ({
                id: this.id(),
                schema: reads.entity.schema,
                tableId: reads.entity.id,
                dependentSchema: view.entity.schema,
                dependentTableId: view.entity.id,
                createdAt: this.now,
            })),
        };
        return design;
    }
}
