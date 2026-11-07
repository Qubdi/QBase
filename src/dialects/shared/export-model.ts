import { listOf } from '@/core/model/collection';
import type { Column } from '@/core/model/column';
import type { Design } from '@/core/model/design';
import type { Entity } from '@/core/model/entity';
import type { Key } from '@/core/model/key';
import type { Link } from '@/core/model/link';
import type { Rule } from '@/core/model/rule';
import { byText } from './text';

export interface ExportKey {
    key: Key;
    /** the members that exist in the table, in index order */
    columns: Column[];
}

/** One table of the design, with its records looked up. */
export interface ExportTable {
    entity: Entity;
    columns: Column[];
    primary: Column[];
    keys: ExportKey[];
    rules: Rule[];
}

/** A foreign key as the SQL scripts need it. */
export interface ExportForeignKey {
    /** the relationship's own name; empty when the parts disagree */
    name: string;
    holder: Entity;
    columns: Column[];
    referenced: Entity;
    referencedColumns: Column[];
}

export interface ExportModel {
    tables: ExportTable[];
    foreignKeys: ExportForeignKey[];
    viewCount: number;
    linkCount: number;
}

function ownColumns(design: Design, entity: Entity): Column[] {
    return entity.columnIds
        .filter((id) => Object.hasOwn(design.columns, id))
        .map((id) => design.columns[id]);
}

function toExportTable(design: Design, entity: Entity): ExportTable {
    const columns = ownColumns(design, entity);
    const byId = new Map(columns.map((c) => [c.id, c]));
    const keys: ExportKey[] = entity.keyIds
        .filter((id) => Object.hasOwn(design.keys, id))
        .map((id) => design.keys[id])
        .map((key) => ({
            key,
            columns: key.members
                .map((m) => byId.get(m))
                .filter((c): c is Column => c !== undefined),
        }));
    return {
        entity,
        columns,
        primary: columns.filter((c) => c.primaryKey),
        keys,
        rules: entity.ruleIds
            .filter((id) => Object.hasOwn(design.rules, id))
            .map((id) => design.rules[id]),
    };
}

/** The table that holds the key: the many side, else the target. */
function holderSide(link: Link): 'source' | 'target' {
    return link.sourceCardinality === 'many' && link.targetCardinality === 'one'
        ? 'source'
        : 'target';
}

interface RawForeignKey {
    link: Link;
    holder: Entity;
    holderColumn: Column;
    referenced: Entity;
    referencedColumn: Column;
}

function resolveLink(design: Design, link: Link): RawForeignKey | undefined {
    const fromSource = holderSide(link) === 'source';
    const holder = design.entities.byId[
        fromSource ? link.sourceEntityId : link.targetEntityId
    ] as Entity | undefined;
    const referenced = design.entities.byId[
        fromSource ? link.targetEntityId : link.sourceEntityId
    ] as Entity | undefined;
    const holderColumn = design.columns[
        fromSource ? link.sourceColumnId : link.targetColumnId
    ] as Column | undefined;
    const referencedColumn = design.columns[
        fromSource ? link.targetColumnId : link.sourceColumnId
    ] as Column | undefined;
    if (!holder || !referenced || !holderColumn || !referencedColumn)
        return undefined;
    if (holder.kind === 'view' || referenced.kind === 'view') return undefined;
    if (
        !holder.columnIds.includes(holderColumn.id) ||
        !referenced.columnIds.includes(referencedColumn.id)
    )
        return undefined;
    return { link, holder, holderColumn, referenced, referencedColumn };
}

/** One constraint per link, except composite primary-key references (EXP-011). */
function buildForeignKeys(design: Design): ExportForeignKey[] {
    const raw = listOf(design.links)
        .map((link) => resolveLink(design, link))
        .filter((r): r is RawForeignKey => r !== undefined);

    const groups = new Map<string, RawForeignKey[]>();
    for (const item of raw) {
        const id = `${item.holder.id}\u0000${item.referenced.id}`;
        const list = groups.get(id);
        if (list) list.push(item);
        else groups.set(id, [item]);
    }

    const out: ExportForeignKey[] = [];
    const merged = new Set<RawForeignKey>();
    for (const item of raw) {
        if (merged.has(item)) continue;
        const group = groups.get(
            `${item.holder.id}\u0000${item.referenced.id}`
        )!;
        const refColumns = ownColumns(design, item.referenced);
        const pk = refColumns.filter((c) => c.primaryKey);
        const covers =
            pk.length > 1 &&
            group.length === pk.length &&
            pk.every((c) => group.some((g) => g.referencedColumn.id === c.id));
        if (covers) {
            const ordered = pk.map((c) =>
                group.find((g) => g.referencedColumn.id === c.id)!
            );
            ordered.forEach((o) => merged.add(o));
            const names = new Set(ordered.map((o) => o.link.name));
            out.push({
                name: names.size === 1 ? ordered[0].link.name : '',
                holder: item.holder,
                columns: ordered.map((o) => o.holderColumn),
                referenced: item.referenced,
                referencedColumns: ordered.map((o) => o.referencedColumn),
            });
        } else {
            merged.add(item);
            out.push({
                name: item.link.name,
                holder: item.holder,
                columns: [item.holderColumn],
                referenced: item.referenced,
                referencedColumns: [item.referencedColumn],
            });
        }
    }
    return out;
}

/** Tables in side-list order (views left out) plus the foreign keys. */
export function prepareExport(design: Design): ExportModel {
    const entities = design.entities.order.map(
        (id) => design.entities.byId[id]
    );
    return {
        tables: entities
            .filter((e) => e.kind === 'table')
            .map((e) => toExportTable(design, e)),
        foreignKeys: buildForeignKeys(design),
        viewCount: entities.filter((e) => e.kind === 'view').length,
        linkCount: design.links.order.length,
    };
}

/** Foreign keys of one table, in the order they were found. */
export function foreignKeysHeldBy(
    model: ExportModel,
    entity: Entity
): ExportForeignKey[] {
    return model.foreignKeys.filter((fk) => fk.holder.id === entity.id);
}

/** Does the key cover exactly the primary-key columns (order ignored)? */
export function coversPrimaryKey(table: ExportTable, key: ExportKey): boolean {
    if (table.primary.length === 0) return false;
    if (key.columns.length !== table.primary.length) return false;
    const ids = new Set(key.columns.map((c) => c.id));
    return table.primary.every((c) => ids.has(c.id));
}

/** Keys that become index statements: not the primary key, not empty. */
export function indexKeys(
    table: ExportTable,
    options: { byColumns: boolean }
): ExportKey[] {
    return table.keys.filter(
        (k) =>
            !k.key.pk &&
            k.columns.length > 0 &&
            !(options.byColumns && coversPrimaryKey(table, k))
    );
}

/** An index column as written in CREATE INDEX: the quoted name, then DESC when sorted high to low. */
export function indexColumnText(
    key: Key,
    column: Column,
    quote: (name: string) => string,
    suffix = ''
): string {
    return `${quote(column.name)}${suffix}${
        key.descending?.includes(column.id) ? ' DESC' : ''
    }`;
}

/** Statements sorted as text, one per line later. */
export function sortedStatements(statements: string[]): string[] {
    return statements.slice().sort(byText);
}

/** `fk_<table>_<cols>` style names, columns joined by an underscore. */
export function joinedColumnNames(columns: Column[]): string {
    return columns.map((c) => c.name).join('_');
}
