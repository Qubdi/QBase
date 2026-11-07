import type { Column } from '@/core/model/column';
import type { Design } from '@/core/model/design';
import { traitsOf } from '@/core/model/database';
import type { Entity } from '@/core/model/entity';
import type { Id } from '@/core/model/id';
import type { Link } from '@/core/model/link';
import { entityList } from '@/core/model/lookup';
import { columnsOf, keysOf, rulesOf } from '@/core/model/lookup';
import type { UserType } from '@/core/model/user-type';
import { listOf } from '@/core/model/collection';

/** A table that exists on both sides, with the id it has on each. */
export interface TablePair {
    current: Id;
    parsed: Id;
}

/**
 * What would change if the parsed design replaced the current one, at summary
 * level (EDT-241). Tables are matched by schema and name. A removed and an added
 * table in the same schema whose fields, indexes and checks are identical, and
 * that have no other twin, are one renamed table (EDT-242).
 */
export interface DesignDiff {
    tables: {
        /** ids in the parsed design */
        added: Id[];
        /** ids in the current design */
        removed: Id[];
        /** includes the renamed tables */
        changed: TablePair[];
        same: TablePair[];
        /** tables that kept everything but the name (also listed in `changed`) */
        renamed: TablePair[];
    };
    links: {
        /** ids in the parsed design */
        added: Id[];
        /** ids in the current design */
        removed: Id[];
    };
    /** custom types by name, with the schema when it has one */
    types: { added: string[]; removed: string[]; changed: string[] };
    /** nothing differs: no preview is needed */
    empty: boolean;
}

/** The match key of a table: schema and name. Views are not part of DBML. */
export const tableKey = (
    design: Pick<Design, 'databaseType'>,
    entity: Pick<Entity, 'schema' | 'name'>
) =>
    `${entity.schema ?? traitsOf(design.databaseType).defaultSchema ?? ''}\u0000${entity.name}`;

const typeKey = (design: Design, type: Pick<UserType, 'schema' | 'name'>) => {
    const schema = type.schema ?? traitsOf(design.databaseType).defaultSchema;
    return schema ? `${schema}.${type.name}` : type.name;
};

const columnSignature = (c: Column) =>
    JSON.stringify([
        c.name,
        c.type.name.toLowerCase(),
        c.length ?? null,
        c.precision ?? null,
        c.scale ?? null,
        !!c.isArray,
        c.nullable,
        c.primaryKey,
        c.unique,
        !!c.increment,
        c.default ?? null,
        c.collation ?? null,
        c.comments ?? null,
    ]);

function tableSignature(design: Design, entity: Entity): string {
    const columns = columnsOf(design, entity);
    const name = (id: Id) => design.columns[id]?.name ?? '';
    return JSON.stringify([
        entity.comments ?? null,
        columns.map(columnSignature),
        keysOf(design, entity)
            .filter((k) => !k.pk)
            .map((k) => [
                k.members.map(name),
                k.distinct,
                k.algorithm ?? null,
                k.note ?? null,
            ]),
        rulesOf(design, entity).map((r) => r.expression),
    ]);
}

function linkSignature(
    design: Design,
    link: Link,
    /** table keys of this side that are really another table under a new name */
    renamed: ReadonlyMap<string, string> = new Map()
): string | undefined {
    const from = design.entities.byId[link.sourceEntityId];
    const to = design.entities.byId[link.targetEntityId];
    const a = design.columns[link.sourceColumnId];
    const b = design.columns[link.targetColumnId];
    if (!from || !to || !a || !b) return undefined;
    return JSON.stringify([
        renamed.get(tableKey(design, from)) ?? tableKey(design, from),
        a.name,
        renamed.get(tableKey(design, to)) ?? tableKey(design, to),
        b.name,
        link.sourceCardinality,
        link.targetCardinality,
    ]);
}

const typeSignature = (t: UserType) =>
    JSON.stringify([t.kind, t.values ?? null, t.members ?? null]);

/** Compares the current design with the one parsed from edited DBML. */
export function diffDesigns(current: Design, parsed: Design): DesignDiff {
    const diff: DesignDiff = {
        tables: { added: [], removed: [], changed: [], same: [], renamed: [] },
        links: { added: [], removed: [] },
        types: { added: [], removed: [], changed: [] },
        empty: true,
    };

    const now = new Map<string, Entity>();
    for (const e of entityList(current))
        if (e.kind !== 'view') now.set(tableKey(current, e), e);
    const seen = new Set<string>();
    for (const next of entityList(parsed)) {
        if (next.kind === 'view') continue;
        const key = tableKey(parsed, next);
        const old = now.get(key);
        seen.add(key);
        if (!old) {
            diff.tables.added.push(next.id);
            continue;
        }
        const pair = { current: old.id, parsed: next.id };
        if (tableSignature(current, old) === tableSignature(parsed, next))
            diff.tables.same.push(pair);
        else diff.tables.changed.push(pair);
    }
    // a table with no fields is not written as DBML, so its absence from the
    // text is not a removal
    for (const [key, old] of now)
        if (!seen.has(key) && old.columnIds.length > 0)
            diff.tables.removed.push(old.id);

    // a rename: one removed and one added table that match on everything but the name
    const schemaOf = (design: Design, e: Entity) =>
        tableKey(design, e).split('\u0000')[0];
    const shape = (design: Design, e: Entity) =>
        `${schemaOf(design, e)}\u0001${tableSignature(design, e)}`;
    const lost = new Map<string, Id[]>();
    for (const id of diff.tables.removed) {
        const key = shape(current, current.entities.byId[id]);
        lost.set(key, [...(lost.get(key) ?? []), id]);
    }
    const gained = new Map<string, Id[]>();
    for (const id of diff.tables.added) {
        const key = shape(parsed, parsed.entities.byId[id]);
        gained.set(key, [...(gained.get(key) ?? []), id]);
    }
    const newKeyToOld = new Map<string, string>();
    for (const [key, olds] of lost) {
        const news = gained.get(key);
        if (olds.length !== 1 || news?.length !== 1) continue;
        const pair = { current: olds[0], parsed: news[0] };
        diff.tables.renamed.push(pair);
        diff.tables.changed.push(pair);
        newKeyToOld.set(
            tableKey(parsed, parsed.entities.byId[pair.parsed]),
            tableKey(current, current.entities.byId[pair.current])
        );
    }
    const renamedOld = new Set(diff.tables.renamed.map((p) => p.current));
    const renamedNew = new Set(diff.tables.renamed.map((p) => p.parsed));
    diff.tables.removed = diff.tables.removed.filter(
        (id) => !renamedOld.has(id)
    );
    diff.tables.added = diff.tables.added.filter((id) => !renamedNew.has(id));

    const before = new Map<string, Id>();
    for (const link of listOf(current.links)) {
        const sig = linkSignature(current, link);
        if (sig) before.set(sig, link.id);
    }
    const kept = new Set<string>();
    for (const link of listOf(parsed.links)) {
        const sig = linkSignature(parsed, link, newKeyToOld);
        if (!sig) continue;
        if (before.has(sig)) kept.add(sig);
        else diff.links.added.push(link.id);
    }
    for (const [sig, id] of before)
        if (!kept.has(sig)) diff.links.removed.push(id);

    const oldTypes = new Map(
        listOf(current.userTypes).map((t) => [typeKey(current, t), t])
    );
    const newTypes = new Map(
        listOf(parsed.userTypes).map((t) => [typeKey(parsed, t), t])
    );
    for (const [key, t] of newTypes) {
        const old = oldTypes.get(key);
        if (!old) diff.types.added.push(key);
        else if (typeSignature(old) !== typeSignature(t))
            diff.types.changed.push(key);
    }
    for (const key of oldTypes.keys())
        if (!newTypes.has(key)) diff.types.removed.push(key);

    diff.empty =
        diff.tables.added.length === 0 &&
        diff.tables.removed.length === 0 &&
        diff.tables.changed.length === 0 &&
        diff.links.added.length === 0 &&
        diff.links.removed.length === 0 &&
        diff.types.added.length === 0 &&
        diff.types.removed.length === 0 &&
        diff.types.changed.length === 0;
    return diff;
}
