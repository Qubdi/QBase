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
 * level (EDT-241). Tables are matched by schema and name; a renamed table is
 * therefore one removed and one added table.
 */
export interface DesignDiff {
    tables: {
        /** ids in the parsed design */
        added: Id[];
        /** ids in the current design */
        removed: Id[];
        changed: TablePair[];
        same: TablePair[];
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

function linkSignature(design: Design, link: Link): string | undefined {
    const from = design.entities.byId[link.sourceEntityId];
    const to = design.entities.byId[link.targetEntityId];
    const a = design.columns[link.sourceColumnId];
    const b = design.columns[link.targetColumnId];
    if (!from || !to || !a || !b) return undefined;
    return JSON.stringify([
        tableKey(design, from),
        a.name,
        tableKey(design, to),
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
        tables: { added: [], removed: [], changed: [], same: [] },
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
    for (const [key, old] of now)
        if (!seen.has(key)) diff.tables.removed.push(old.id);

    const before = new Map<string, Id>();
    for (const link of listOf(current.links)) {
        const sig = linkSignature(current, link);
        if (sig) before.set(sig, link.id);
    }
    const kept = new Set<string>();
    for (const link of listOf(parsed.links)) {
        const sig = linkSignature(parsed, link);
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
