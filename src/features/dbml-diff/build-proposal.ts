import { collectionOf, listOf } from '@/core/model/collection';
import type { Column } from '@/core/model/column';
import type { Design } from '@/core/model/design';
import { TABLE_WIDTH } from '@/core/model/entity';
import type { Entity } from '@/core/model/entity';
import type { Id } from '@/core/model/id';
import type { Key } from '@/core/model/key';
import type { Link } from '@/core/model/link';
import { entityList } from '@/core/model/lookup';
import type { Rule } from '@/core/model/rule';
import type { DesignDiff } from './diff-designs';
import { tableKey } from './diff-designs';
import { minBy } from '@/core/model/extent';

export type Mark = 'added' | 'removed' | 'changed';

/** What a diff turns into: the design to adopt, the design to draw, the marks. */
export interface Proposal {
    /** the current design with tables, links and custom types of the parsed one */
    accepted: Design;
    /** `accepted` plus the removed tables and links, for drawing the preview */
    preview: Design;
    tables: Record<Id, Mark>;
    links: Record<Id, Mark>;
    /** old names of renamed tables, by table id (EDT-242) */
    renames: Record<Id, string>;
}

/** Space kept to the right of the existing tables and between new ones. */
const GAP_X = 150;
const GAP_Y = 40;
const HEADER = 48;
const ROW = 28;

interface Records {
    columns: Record<Id, Column>;
    keys: Record<Id, Key>;
    rules: Record<Id, Rule>;
}

function take(from: Design, entity: Entity, into: Records) {
    for (const id of entity.columnIds) into.columns[id] = from.columns[id];
    for (const id of entity.keyIds) into.keys[id] = from.keys[id];
    for (const id of entity.ruleIds) into.rules[id] = from.rules[id];
}

/** Free places for the added tables: one column, right of everything. */
function freePlaces(current: Design, added: readonly Entity[]) {
    const all = entityList(current);
    const right = all.reduce(
        (m, e) => Math.max(m, e.x + (e.width ?? TABLE_WIDTH.default)),
        0
    );
    let y = all.length ? minBy(all, (e) => e.y) : 0;
    const x = all.length ? right + GAP_X : 0;
    return added.map((e) => {
        const at = { x, y };
        y += HEADER + ROW * e.columnIds.length + GAP_Y;
        return at;
    });
}

/**
 * Builds the design a diff would produce, and the same design with the removed
 * parts left in for drawing (EDT-241, EDT-245). Matching tables keep position,
 * colour, width, area and id; areas, notes and views are kept; tables,
 * relationships and custom types are the parsed ones.
 */
export function buildProposal(
    current: Design,
    parsed: Design,
    diff: DesignDiff
): Proposal {
    const idOf = new Map<Id, Id>();
    const matched = new Map<Id, Entity>();
    for (const pair of [...diff.tables.same, ...diff.tables.changed]) {
        idOf.set(pair.parsed, pair.current);
        matched.set(pair.parsed, current.entities.byId[pair.current]);
    }
    const added = diff.tables.added.map((id) => parsed.entities.byId[id]);
    const spots = freePlaces(current, added);
    const places = new Map(added.map((e, i) => [e.id, spots[i]]));

    const records: Records = { columns: {}, keys: {}, rules: {} };
    const entities: Entity[] = [];
    for (const next of entityList(parsed)) {
        if (next.kind === 'view') continue;
        const old = matched.get(next.id);
        const place = places.get(next.id);
        let entity: Entity;
        if (old) {
            entity = {
                ...next,
                id: old.id,
                x: old.x,
                y: old.y,
                color: old.color,
                width: old.width,
                expanded: old.expanded,
                regionId: old.regionId,
                createdAt: old.createdAt,
            };
        } else {
            entity = { ...next, x: place?.x ?? 0, y: place?.y ?? 0 };
            delete entity.regionId;
        }
        if (entity.width === undefined) delete entity.width;
        if (entity.expanded === undefined) delete entity.expanded;
        if (entity.regionId === undefined) delete entity.regionId;
        entities.push(entity);
        take(parsed, next, records);
    }
    // views are not part of DBML, and neither is a table without fields: they
    // stay as they are
    const taken = new Set(idOf.values());
    for (const old of entityList(current)) {
        if (
            old.kind !== 'view' &&
            (old.columnIds.length > 0 || taken.has(old.id))
        )
            continue;
        entities.push(old);
        take(current, old, records);
    }
    const final = new Set(entities.map((e) => e.id));

    const links: Link[] = listOf(parsed.links).map((link) => ({
        ...link,
        // the DBML export numbers each Ref ("fk_0_<name>"); take that away so
        // the name does not grow by one prefix on every accepted edit
        name: link.name.replace(/^fk_\d+_(?=.)/, ''),
        sourceEntityId: idOf.get(link.sourceEntityId) ?? link.sourceEntityId,
        targetEntityId: idOf.get(link.targetEntityId) ?? link.targetEntityId,
    }));
    for (const link of listOf(current.links)) {
        const a = current.entities.byId[link.sourceEntityId];
        const b = current.entities.byId[link.targetEntityId];
        if (a?.kind !== 'view' && b?.kind !== 'view') continue;
        if (final.has(link.sourceEntityId) && final.has(link.targetEntityId))
            links.push(link);
    }

    const accepted: Design = {
        ...current,
        entities: collectionOf(entities),
        columns: records.columns,
        keys: records.keys,
        rules: records.rules,
        links: collectionOf(links),
        userTypes: parsed.userTypes,
        dependencies: current.dependencies.filter(
            (d) => final.has(d.tableId) && final.has(d.dependentTableId)
        ),
    };

    // the preview: the removed tables stand where they were, with their links
    const ghosts = diff.tables.removed.map((id) => current.entities.byId[id]);
    const shown: Records = {
        columns: { ...records.columns },
        keys: { ...records.keys },
        rules: { ...records.rules },
    };
    for (const ghost of ghosts) take(current, ghost, shown);
    const preview: Design = {
        ...accepted,
        entities: collectionOf([...entities, ...ghosts]),
        columns: shown.columns,
        keys: shown.keys,
        rules: shown.rules,
    };
    const byName = new Map(
        entityList(preview).map((e) => [tableKey(preview, e), e])
    );
    const columnNamed = (entity: Entity, id: Id) => {
        const name = current.columns[id]?.name;
        return entity.columnIds.find((c) => preview.columns[c]?.name === name);
    };
    const drawnRemoved: Link[] = [];
    for (const id of diff.links.removed) {
        const link = current.links.byId[id];
        const from = current.entities.byId[link.sourceEntityId];
        const to = current.entities.byId[link.targetEntityId];
        const a = from && byName.get(tableKey(current, from));
        const b = to && byName.get(tableKey(current, to));
        const sourceColumnId = a && columnNamed(a, link.sourceColumnId);
        const targetColumnId = b && columnNamed(b, link.targetColumnId);
        if (!a || !b || !sourceColumnId || !targetColumnId) continue;
        drawnRemoved.push({
            ...link,
            sourceEntityId: a.id,
            targetEntityId: b.id,
            sourceColumnId,
            targetColumnId,
        });
    }
    const drawn: Design = {
        ...preview,
        links: collectionOf([...links, ...drawnRemoved]),
    };

    const tables: Record<Id, Mark> = {};
    for (const id of diff.tables.added) tables[id] = 'added';
    for (const id of diff.tables.removed) tables[id] = 'removed';
    for (const pair of diff.tables.changed) tables[pair.current] = 'changed';
    const renames: Record<Id, string> = {};
    for (const pair of diff.tables.renamed)
        renames[pair.current] = current.entities.byId[pair.current].name;
    const marked: Record<Id, Mark> = {};
    for (const id of diff.links.added) marked[id] = 'added';
    for (const link of drawnRemoved) marked[link.id] = 'removed';
    return { accepted, preview: drawn, tables, links: marked, renames };
}
