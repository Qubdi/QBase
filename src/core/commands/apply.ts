import {
    getItem,
    hasItem,
    indexOfItem,
    insertItem,
    isPermutation,
    removeItem,
    reorderItems,
    replaceItem,
} from '../model/collection';
import type { Collection } from '../model/collection';
import type { Column } from '../model/column';
import type { Design } from '../model/design';
import { TABLE_WIDTH } from '../model/entity';
import type { EntityParts } from '../model/entity-parts';
import type { Id } from '../model/id';
import {
    entityOf,
    linksOfColumn,
    linksOfEntity,
    partsOf,
} from '../model/lookup';
import { normaliseCardinality } from '../model/link';
import type { Link } from '../model/link';
import { syncPrimaryKey } from '../model/primary-key';
import type {
    ApplyOptions,
    ApplyResult,
    Command,
    EntityPatch,
    ItemName,
    ItemRecords,
    PartName,
    PartRecords,
    Patch,
    Placed,
} from './command';
import { CommandError, fail } from './failure';
import { applyPatch, inversePatch } from './patch';
import { settleColumn } from './settle-column';

interface Step {
    design: Design;
    inverse: Command;
    changed: boolean;
}

const NOTHING: Command = { type: 'group', commands: [] };

function unchanged(design: Design): Step {
    return { design, inverse: NOTHING, changed: false };
}

/**
 * Applies one command to a design. Pure: the design is never changed, the
 * result is the next design and the command that undoes this one. A refused
 * command (read-only design, unknown id, broken reference) returns a failure
 * and leaves everything as it was. `updatedAt` moves on every real change.
 */
export function apply(
    design: Design,
    command: Command,
    options: ApplyOptions = {}
): ApplyResult {
    if (options.readOnly)
        return {
            ok: false,
            reason: 'read-only',
            message: 'This diagram cannot be edited',
        };
    try {
        const step = run(design, command);
        if (!step.changed)
            return { ok: true, design, inverse: step.inverse, changed: false };
        return {
            ok: true,
            design: { ...step.design, updatedAt: options.now ?? Date.now() },
            inverse: step.inverse,
            changed: true,
        };
    } catch (error) {
        if (error instanceof CommandError)
            return { ok: false, reason: error.reason, message: error.message };
        throw error;
    }
}

function run(design: Design, command: Command): Step {
    switch (command.type) {
        case 'design.rename':
            return renameDesign(design, command.name);
        case 'design.replace':
            return design === command.design
                ? unchanged(design)
                : {
                      design: command.design,
                      inverse: { type: 'design.replace', design },
                      changed: true,
                  };
        case 'group':
            return runGroup(design, command.commands, command.label);
        case 'entity.insert':
            return insertEntity(design, command);
        case 'entity.remove':
            return removeEntity(design, command.id);
        case 'entity.update':
            return updateEntity(design, command.id, command.patch);
        case 'entity.move':
            return moveEntities(design, command.moves);
        case 'entity.reorder':
            return reorderEntities(design, command.ids);
        case 'entity.restore':
            return editParts(
                design,
                command.parts.entity.id,
                () => command.parts,
                false
            );
        case 'part.insert':
            return insertPart(design, command);
        case 'part.remove':
            return removePart(design, command);
        case 'part.update':
            return updatePart(design, command);
        case 'part.reorder':
            return reorderParts(design, command);
        case 'dependency.insert':
            return insertDependency(design, command.item, command.at);
        case 'dependency.remove':
            return removeDependency(design, command.id);
        case 'item.insert':
            return insertItemCommand(design, command);
        case 'item.remove':
            return removeItemCommand(design, command);
        case 'item.update':
            return updateItemCommand(design, command);
        case 'item.reorder':
            return reorderItemCommand(design, command);
    }
}

// ---------------------------------------------------------------- design level

function renameDesign(design: Design, name: string): Step {
    if (name.trim() === '' || name === design.name) return unchanged(design);
    return {
        design: { ...design, name },
        inverse: { type: 'design.rename', name: design.name },
        changed: true,
    };
}

function runGroup(design: Design, commands: Command[], label?: string): Step {
    let current = design;
    const inverses: Command[] = [];
    let i = 0;
    while (i < commands.length) {
        const first = commands[i];
        const kind =
            first.type === 'entity.remove' || first.type === 'entity.insert'
                ? first.type
                : undefined;
        let end = i + 1;
        while (kind && end < commands.length && commands[end].type === kind)
            end += 1;
        const count = end - i;
        let step: Step;
        if (kind === 'entity.remove' && count > 1) {
            // a run of removals or inserts is done in one pass (deleting,
            // undoing the delete and pasting many tables)
            const ids = commands.slice(i, end).map((c) => (c as { id: Id }).id);
            step = removeEntities(current, ids);
        } else if (kind === 'entity.insert' && count > 1) {
            step = insertEntities(
                current,
                commands.slice(i, end) as InsertCommand[]
            );
        } else {
            step = run(current, first);
        }
        i = count > 1 ? end : i + 1;
        if (!step.changed) continue;
        current = step.design;
        // a batch undoes as its own list, last one first
        if (count > 1 && step.inverse.type === 'group')
            inverses.unshift(...step.inverse.commands);
        else inverses.unshift(step.inverse);
    }
    if (inverses.length === 0) return unchanged(design);
    return {
        design: current,
        inverse: {
            type: 'group',
            commands: inverses,
            ...(label === undefined ? {} : { label }),
        },
        changed: true,
    };
}

// ------------------------------------------------------------------ entity level

function partsFor(design: Design, entityId: Id): EntityParts {
    const entity = entityOf(design, entityId);
    if (!entity)
        return fail('not-found', `No table or view with id ${entityId}`);
    return partsOf(design, entity);
}

/**
 * One kind of own record (columns, indexes or checks) of an entity, written
 * in place of the old ones. A list that did not change keeps the very same
 * map, so renaming or moving a table does not copy every column of the design.
 */
function rewriteRecords<T extends { id: Id }>(
    all: Readonly<Record<Id, T>>,
    before: readonly T[],
    after: readonly T[],
    used: string
): Record<Id, T> {
    if (samePartsList(before, after)) return all;
    const next = { ...all };
    for (const record of before) delete next[record.id];
    for (const record of after) {
        if (Object.hasOwn(next, record.id))
            fail('invalid', `${used} ${record.id} is already used`);
        next[record.id] = record;
    }
    return next;
}

/** Writes `after` in place of `before` (the same entity's own records). */
function writeParts(
    design: Design,
    before: EntityParts,
    after: EntityParts
): Design {
    return {
        ...design,
        entities: replaceItem(design.entities, after.entity),
        columns: rewriteRecords(
            design.columns,
            before.columns,
            after.columns,
            'Column id'
        ),
        keys: rewriteRecords(design.keys, before.keys, after.keys, 'Index id'),
        rules: rewriteRecords(
            design.rules,
            before.rules,
            after.rules,
            'Check constraint id'
        ),
    };
}

function samePartsList<T>(a: readonly T[], b: readonly T[]): boolean {
    return a.length === b.length && a.every((item, i) => item === b[i]);
}

function sameParts(a: EntityParts, b: EntityParts): boolean {
    return (
        a.entity === b.entity &&
        samePartsList(a.columns, b.columns) &&
        samePartsList(a.keys, b.keys) &&
        samePartsList(a.rules, b.rules)
    );
}

/** Checks that the parts hang together: lists match records, keys use own columns. */
function checkParts(parts: EntityParts): void {
    const { entity } = parts;
    const same = (ids: readonly Id[], records: readonly { id: Id }[]) =>
        ids.length === records.length &&
        ids.every((id, i) => records[i].id === id);
    if (!same(entity.columnIds, parts.columns))
        fail('invalid', 'The column list does not match the columns');
    if (!same(entity.keyIds, parts.keys))
        fail('invalid', 'The index list does not match the indexes');
    if (!same(entity.ruleIds, parts.rules))
        fail('invalid', 'The check list does not match the checks');
    for (const key of parts.keys) {
        for (const id of key.members) {
            if (!entity.columnIds.includes(id))
                fail(
                    'invalid',
                    `Index ${key.id} uses a column of another table`
                );
        }
    }
}

/**
 * Edits an entity's own records. `edit` returns the new parts; the primary-key
 * index is brought back in line (unless `sync` is false, used to put back an
 * exact snapshot). The inverse restores the snapshot taken before.
 */
function editParts(
    design: Design,
    entityId: Id,
    edit: (before: EntityParts) => EntityParts,
    sync = true
): Step {
    const before = partsFor(design, entityId);
    let after = edit(before);
    if (sync) {
        after = syncPrimaryKey(
            after,
            (id) =>
                Object.hasOwn(design.keys, id) &&
                !before.keys.some((key) => key.id === id)
        );
    }
    if (sameParts(before, after)) return unchanged(design);
    checkParts(after);
    return {
        design: writeParts(design, before, after),
        inverse: { type: 'entity.restore', parts: before },
        changed: true,
    };
}

type InsertCommand = Extract<Command, { type: 'entity.insert' }>;

/**
 * Inserts several tables in one pass, with the same result and the same
 * inverses (a removal each, last first) as inserting them one by one.
 */
function insertEntities(design: Design, commands: InsertCommand[]): Step {
    const columns = { ...design.columns };
    const keys = { ...design.keys };
    const rules = { ...design.rules };
    const entities = {
        byId: { ...design.entities.byId },
        order: design.entities.order.slice(),
    };
    const links = {
        byId: { ...design.links.byId },
        order: design.links.order.slice(),
    };
    const dependencies = design.dependencies.slice();
    // the maps above are shared with this view and grow as tables go in
    const working: Design = {
        ...design,
        entities,
        columns,
        keys,
        rules,
        links,
    };
    const inverses: Command[] = [];
    const place = (order: Id[], id: Id, at: number | undefined) =>
        order.splice(
            at === undefined
                ? order.length
                : Math.max(0, Math.min(at, order.length)),
            0,
            id
        );
    for (const command of commands) {
        const { parts } = command;
        if (hasItem(entities, parts.entity.id))
            fail(
                'duplicate',
                `A table with id ${parts.entity.id} already exists`
            );
        checkParts(parts);
        for (const c of parts.columns) {
            if (Object.hasOwn(columns, c.id))
                fail('duplicate', `Column id ${c.id} is already used`);
            columns[c.id] = c;
        }
        for (const k of parts.keys) {
            if (Object.hasOwn(keys, k.id))
                fail('duplicate', `Index id ${k.id} is already used`);
            keys[k.id] = k;
        }
        for (const r of parts.rules) {
            if (Object.hasOwn(rules, r.id))
                fail(
                    'duplicate',
                    `Check constraint id ${r.id} is already used`
                );
            rules[r.id] = r;
        }
        entities.byId[parts.entity.id] = parts.entity;
        place(entities.order, parts.entity.id, command.at);
        const placedLinks = [...(command.links ?? [])].sort(
            (a, b) => a.index - b.index
        );
        for (const placed of placedLinks) {
            checkLink(working, placed.item);
            links.byId[placed.item.id] = placed.item;
            place(links.order, placed.item.id, placed.index);
        }
        for (const placed of [...(command.dependencies ?? [])].sort(
            (a, b) => a.index - b.index
        ))
            dependencies.splice(
                Math.min(placed.index, dependencies.length),
                0,
                placed.item
            );
        inverses.unshift({ type: 'entity.remove', id: parts.entity.id });
    }
    return {
        design: { ...working, dependencies },
        inverse: { type: 'group', commands: inverses },
        changed: true,
    };
}

function insertEntity(
    design: Design,
    command: Extract<Command, { type: 'entity.insert' }>
): Step {
    const { parts } = command;
    if (hasItem(design.entities, parts.entity.id))
        fail('duplicate', `A table with id ${parts.entity.id} already exists`);
    checkParts(parts);
    const columns = { ...design.columns };
    const keys = { ...design.keys };
    const rules = { ...design.rules };
    for (const c of parts.columns) {
        if (Object.hasOwn(columns, c.id))
            fail('duplicate', `Column id ${c.id} is already used`);
        columns[c.id] = c;
    }
    for (const k of parts.keys) {
        if (Object.hasOwn(keys, k.id))
            fail('duplicate', `Index id ${k.id} is already used`);
        keys[k.id] = k;
    }
    for (const r of parts.rules) {
        if (Object.hasOwn(rules, r.id))
            fail('duplicate', `Check constraint id ${r.id} is already used`);
        rules[r.id] = r;
    }
    let next: Design = {
        ...design,
        entities: insertItem(design.entities, parts.entity, command.at),
        columns,
        keys,
        rules,
    };
    const links = [...(command.links ?? [])].sort((a, b) => a.index - b.index);
    for (const placed of links) {
        checkLink(next, placed.item);
        next = {
            ...next,
            links: insertItem(next.links, placed.item, placed.index),
        };
    }
    const deps = [...next.dependencies];
    for (const placed of [...(command.dependencies ?? [])].sort(
        (a, b) => a.index - b.index
    ))
        deps.splice(Math.min(placed.index, deps.length), 0, placed.item);
    next = { ...next, dependencies: deps };
    return {
        design: next,
        inverse: { type: 'entity.remove', id: parts.entity.id },
        changed: true,
    };
}

function removeEntity(design: Design, id: Id): Step {
    const parts = partsFor(design, id);
    const at = indexOfItem(design.entities, id);
    const links: Placed<Link>[] = [];
    design.links.order.forEach((linkId, index) => {
        const link = design.links.byId[linkId];
        if (link.sourceEntityId === id || link.targetEntityId === id)
            links.push({ item: link, index });
    });
    const dependencies: Placed<(typeof design.dependencies)[number]>[] = [];
    design.dependencies.forEach((dep, index) => {
        if (dep.tableId === id || dep.dependentTableId === id)
            dependencies.push({ item: dep, index });
    });

    const columns = { ...design.columns };
    const keys = { ...design.keys };
    const rules = { ...design.rules };
    for (const c of parts.columns) delete columns[c.id];
    for (const k of parts.keys) delete keys[k.id];
    for (const r of parts.rules) delete rules[r.id];
    let linkState: Collection<Link> = design.links;
    for (const { item } of links) linkState = removeItem(linkState, item.id);
    const dropped = new Set(dependencies.map((d) => d.item.id));
    return {
        design: {
            ...design,
            entities: removeItem(design.entities, id),
            columns,
            keys,
            rules,
            links: linkState,
            dependencies: design.dependencies.filter((d) => !dropped.has(d.id)),
        },
        inverse: { type: 'entity.insert', parts, at, links, dependencies },
        changed: true,
    };
}

/**
 * Removes several tables in one pass, with the same result and the same
 * inverses as removing them one by one: every part map and list is copied once
 * instead of once per table.
 */
function removeEntities(design: Design, ids: readonly Id[]): Step {
    const gone = new Set<Id>();
    for (const id of ids) {
        if (gone.has(id) || !hasItem(design.entities, id))
            fail('not-found', `No table or view with id ${id}`);
        gone.add(id);
    }
    // positions are those of the moment each table is removed, so the
    // inverses (run last to first) put everything back where it was
    const entityOrder = design.entities.order.slice();
    const linkOrder = design.links.order.slice();
    const linkEnds = new Map<Id, Id[]>();
    for (const linkId of linkOrder) {
        const link = design.links.byId[linkId];
        for (const end of new Set([link.sourceEntityId, link.targetEntityId])) {
            const list = linkEnds.get(end);
            if (list) list.push(linkId);
            else linkEnds.set(end, [linkId]);
        }
    }
    let dependencies = design.dependencies.slice();
    const droppedLinks = new Set<Id>();
    const inverses: Command[] = [];
    for (const id of ids) {
        const parts = partsFor(design, id);
        const at = entityOrder.indexOf(id);
        entityOrder.splice(at, 1);
        const links: Placed<Link>[] = [];
        const here = (linkEnds.get(id) ?? []).filter(
            (linkId) => !droppedLinks.has(linkId)
        );
        for (const linkId of here)
            links.push({
                item: design.links.byId[linkId],
                index: linkOrder.indexOf(linkId),
            });
        for (const linkId of here) {
            linkOrder.splice(linkOrder.indexOf(linkId), 1);
            droppedLinks.add(linkId);
        }
        const placed: Placed<(typeof design.dependencies)[number]>[] = [];
        dependencies.forEach((dep, index) => {
            if (dep.tableId === id || dep.dependentTableId === id)
                placed.push({ item: dep, index });
        });
        if (placed.length > 0) {
            const dropped = new Set(placed.map((d) => d.item));
            dependencies = dependencies.filter((d) => !dropped.has(d));
        }
        inverses.unshift({
            type: 'entity.insert',
            parts,
            at,
            links,
            dependencies: placed,
        });
    }
    const columns = { ...design.columns };
    const keys = { ...design.keys };
    const rules = { ...design.rules };
    const byId = { ...design.entities.byId };
    for (const id of ids) {
        const entity = design.entities.byId[id];
        for (const c of entity.columnIds) delete columns[c];
        for (const k of entity.keyIds) delete keys[k];
        for (const r of entity.ruleIds) delete rules[r];
        delete byId[id];
    }
    const linkById = { ...design.links.byId };
    for (const linkId of droppedLinks) delete linkById[linkId];
    return {
        design: {
            ...design,
            entities: { byId, order: entityOrder },
            columns,
            keys,
            rules,
            links: { byId: linkById, order: linkOrder },
            dependencies,
        },
        inverse: { type: 'group', commands: inverses },
        changed: true,
    };
}

function updateEntity(design: Design, id: Id, rawPatch: EntityPatch): Step {
    const patch: Record<string, unknown> = { ...rawPatch };
    // empty names are ignored (EDT-094); an empty schema means "no schema"
    if (typeof patch.name === 'string' && patch.name.trim() === '')
        delete patch.name;
    if (patch.schema === '') patch.schema = undefined;
    if ('id' in patch) fail('invalid', 'A table id cannot be changed');
    for (const key of ['x', 'y', 'width']) {
        const v = patch[key];
        if (v !== undefined && !(typeof v === 'number' && Number.isFinite(v)))
            fail('invalid', `${key} must be a number`);
    }
    // a table is never narrower or wider than the editor allows
    if (typeof patch.width === 'number')
        patch.width = Math.min(
            TABLE_WIDTH.max,
            Math.max(TABLE_WIDTH.min, patch.width)
        );
    const before = partsFor(design, id);
    const nextEntity = applyPatch(before.entity, patch);
    if (nextEntity === before.entity) return unchanged(design);

    const step = editParts(
        design,
        id,
        (parts) => ({ ...parts, entity: nextEntity }),
        false
    );
    if (!('schema' in patch)) return step;

    // links keep a copy of each end's schema; keep them in step
    let links = step.design.links;
    const undo: Command[] = [];
    for (const link of linksOfEntity(design, id)) {
        const linkPatch: Patch<Link> = {};
        if (
            link.sourceEntityId === id &&
            link.sourceSchema !== nextEntity.schema
        )
            linkPatch.sourceSchema = nextEntity.schema;
        if (
            link.targetEntityId === id &&
            link.targetSchema !== nextEntity.schema
        )
            linkPatch.targetSchema = nextEntity.schema;
        if (Object.keys(linkPatch).length === 0) continue;
        const updated = applyPatch(link, linkPatch);
        links = replaceItem(links, updated);
        undo.push({
            type: 'item.update',
            collection: 'links',
            id: link.id,
            patch: inversePatch(link, linkPatch),
        });
    }
    if (undo.length === 0) return step;
    return {
        design: { ...step.design, links },
        inverse: { type: 'group', commands: [step.inverse, ...undo] },
        changed: true,
    };
}

function moveEntities(
    design: Design,
    moves: { id: Id; x: number; y: number }[]
): Step {
    const entities = { ...design.entities.byId };
    const back: { id: Id; x: number; y: number }[] = [];
    for (const move of moves) {
        const entity = getItem(design.entities, move.id);
        if (!entity) fail('not-found', `No table or view with id ${move.id}`);
        if (!Number.isFinite(move.x) || !Number.isFinite(move.y))
            fail('invalid', 'A position must be a number');
        if (entity.x === move.x && entity.y === move.y) continue;
        back.push({ id: entity.id, x: entity.x, y: entity.y });
        entities[entity.id] = { ...entity, x: move.x, y: move.y };
    }
    if (back.length === 0) return unchanged(design);
    return {
        design: { ...design, entities: { ...design.entities, byId: entities } },
        inverse: { type: 'entity.move', moves: back },
        changed: true,
    };
}

function reorderEntities(design: Design, ids: Id[]): Step {
    if (!isPermutation(design.entities.order, ids))
        fail('invalid', 'The new order must list every table exactly once');
    if (ids.every((id, i) => design.entities.order[i] === id))
        return unchanged(design);
    return {
        design: { ...design, entities: reorderItems(design.entities, ids) },
        inverse: { type: 'entity.reorder', ids: design.entities.order.slice() },
        changed: true,
    };
}

// -------------------------------------------------------------------- part level

const LIST_KEY = {
    columns: 'columnIds',
    keys: 'keyIds',
    rules: 'ruleIds',
} as const;

function listOfParts(parts: EntityParts, part: PartName): { id: Id }[] {
    return parts[part];
}

function rebuild(
    parts: EntityParts,
    part: PartName,
    records: { id: Id }[]
): EntityParts {
    return {
        ...parts,
        entity: { ...parts.entity, [LIST_KEY[part]]: records.map((r) => r.id) },
        [part]: records,
    } as EntityParts;
}

function checkPartEditable(parts: EntityParts, part: PartName): void {
    if (parts.entity.kind === 'view' && part !== 'columns')
        fail('invalid', 'A view has no indexes or check constraints');
}

function checkKeyColumns(parts: EntityParts, columnIds: readonly Id[]): void {
    for (const id of columnIds) {
        if (!parts.entity.columnIds.includes(id))
            fail('invalid', `Column ${id} is not in this table`);
    }
}

function insertPart(
    design: Design,
    command: Extract<Command, { type: 'part.insert' }>
): Step {
    const { part, entityId } = command;
    const item = command.item as { id: Id };
    return editParts(design, entityId, (before) => {
        checkPartEditable(before, part);
        const pool = {
            columns: design.columns,
            keys: design.keys,
            rules: design.rules,
        }[part];
        if (Object.hasOwn(pool, item.id))
            fail('duplicate', `Id ${item.id} is already used`);
        if (part === 'keys')
            checkKeyColumns(
                before,
                (command.item as PartRecords['keys']).members
            );
        const records = listOfParts(before, part).slice();
        const at =
            command.at === undefined
                ? records.length
                : Math.max(0, Math.min(command.at, records.length));
        records.splice(at, 0, item);
        return rebuild(before, part, records);
    });
}

function removePart(
    design: Design,
    command: Extract<Command, { type: 'part.remove' }>
): Step {
    const { part, entityId, id } = command;
    const before = partsFor(design, entityId);
    if (!listOfParts(before, part).some((r) => r.id === id))
        fail('not-found', `No such ${part.slice(0, -1)} ${id}`);

    // a removed column takes its links with it and leaves every index
    const removedLinks: Placed<Link>[] = [];
    let links = design.links;
    if (part === 'columns') {
        const hit = new Set(
            linksOfColumn(design, entityId, id).map((l) => l.id)
        );
        design.links.order.forEach((linkId, index) => {
            if (hit.has(linkId))
                removedLinks.push({ item: design.links.byId[linkId], index });
        });
        for (const placed of removedLinks)
            links = removeItem(links, placed.item.id);
    }
    const step = editParts(design, entityId, (parts) => {
        const records = listOfParts(parts, part).filter((r) => r.id !== id);
        const next = rebuild(parts, part, records);
        if (part !== 'columns') return next;
        return {
            ...next,
            keys: next.keys.map((key) =>
                key.members.includes(id)
                    ? {
                          ...key,
                          members: key.members.filter((c) => c !== id),
                      }
                    : key
            ),
        };
    });
    if (removedLinks.length === 0) return step;
    return {
        design: { ...step.design, links },
        inverse: {
            type: 'group',
            commands: [
                step.inverse,
                ...removedLinks.map((placed): Command => ({
                    type: 'item.insert',
                    collection: 'links',
                    item: placed.item,
                    at: placed.index,
                })),
            ],
        },
        changed: true,
    };
}

function updatePart(
    design: Design,
    command: Extract<Command, { type: 'part.update' }>
): Step {
    const { part, entityId, id } = command;
    const patch = command.patch as Record<string, unknown>;
    if ('id' in patch) fail('invalid', 'An id cannot be changed');
    return editParts(design, entityId, (before) => {
        checkPartEditable(before, part);
        const records = listOfParts(before, part).slice();
        const index = records.findIndex((r) => r.id === id);
        if (index < 0) fail('not-found', `No such ${part.slice(0, -1)} ${id}`);
        if (part === 'keys' && Array.isArray(patch.members))
            checkKeyColumns(before, patch.members as Id[]);
        if (part === 'columns') {
            const column = records[index] as Column;
            const otherPrimary = before.columns.some(
                (c) => c.id !== id && c.primaryKey
            );
            records[index] = settleColumn(
                column,
                patch as Patch<Column>,
                otherPrimary
            );
        } else {
            records[index] = applyPatch(records[index], patch);
        }
        return rebuild(before, part, records);
    });
}

function reorderParts(
    design: Design,
    command: Extract<Command, { type: 'part.reorder' }>
): Step {
    const { part, entityId, ids } = command;
    return editParts(design, entityId, (before) => {
        const records = listOfParts(before, part);
        if (
            !isPermutation(
                records.map((r) => r.id),
                ids
            )
        )
            fail(
                'invalid',
                `The new order must list every ${part.slice(0, -1)} exactly once`
            );
        const byId = new Map(records.map((r) => [r.id, r]));
        return rebuild(
            before,
            part,
            ids.map((id) => byId.get(id)!)
        );
    });
}

// -------------------------------------------------------------------- item level

function collectionOfDesign(
    design: Design,
    name: ItemName
): Collection<{ id: Id }> {
    return design[name] as Collection<{ id: Id }>;
}

function withCollection(
    design: Design,
    name: ItemName,
    collection: Collection<{ id: Id }>
): Design {
    return { ...design, [name]: collection } as Design;
}

function checkLink(design: Design, link: Link): void {
    for (const [entityId, columnId] of [
        [link.sourceEntityId, link.sourceColumnId],
        [link.targetEntityId, link.targetColumnId],
    ]) {
        const entity = entityOf(design, entityId);
        if (!entity)
            fail('invalid', `Link ${link.id} points at a missing table`);
        if (!entity.columnIds.includes(columnId))
            fail('invalid', `Link ${link.id} points at a missing column`);
    }
}

function insertDependency(
    design: Design,
    item: Design['dependencies'][number],
    at?: number
): Step {
    if (design.dependencies.some((d) => d.id === item.id))
        fail('duplicate', `Id ${item.id} is already used`);
    const view = design.entities.byId[item.dependentTableId];
    if (!view || !design.entities.byId[item.tableId])
        fail('invalid', `Dependency ${item.id} points at a missing table`);
    if (item.tableId === item.dependentTableId)
        fail('invalid', 'A table cannot depend on itself');
    const list = design.dependencies.slice();
    list.splice(
        at === undefined ? list.length : Math.max(0, Math.min(at, list.length)),
        0,
        item
    );
    return {
        design: { ...design, dependencies: list },
        inverse: { type: 'dependency.remove', id: item.id },
        changed: true,
    };
}

function removeDependency(design: Design, id: Id): Step {
    const index = design.dependencies.findIndex((d) => d.id === id);
    if (index < 0) fail('not-found', `No dependency ${id}`);
    return {
        design: {
            ...design,
            dependencies: design.dependencies.filter((d) => d.id !== id),
        },
        inverse: {
            type: 'dependency.insert',
            item: design.dependencies[index],
            at: index,
        },
        changed: true,
    };
}

function insertItemCommand(
    design: Design,
    command: Extract<Command, { type: 'item.insert' }>
): Step {
    const { collection: name } = command;
    const item = command.item as ItemRecords[ItemName];
    const collection = collectionOfDesign(design, name);
    if (hasItem(collection, item.id))
        fail('duplicate', `Id ${item.id} is already used`);
    let record = item;
    if (name === 'regions' || name === 'memos')
        checkBox((item as { box?: unknown }).box);
    if (name === 'links') {
        record = normaliseCardinality(item as Link);
        checkLink(design, record as Link);
    }
    return {
        design: withCollection(
            design,
            name,
            insertItem(collection, record, command.at)
        ),
        inverse: {
            type: 'item.remove',
            collection: name,
            id: item.id,
        } as Command,
        changed: true,
    };
}

function removeItemCommand(
    design: Design,
    command: Extract<Command, { type: 'item.remove' }>
): Step {
    const { collection: name, id } = command;
    const collection = collectionOfDesign(design, name);
    const item = getItem(collection, id);
    if (!item) return fail('not-found', `No such ${name} entry ${id}`);
    const at = indexOfItem(collection, id);
    let next = withCollection(design, name, removeItem(collection, id));
    const inverse: Command[] = [
        { type: 'item.insert', collection: name, item, at } as Command,
    ];
    if (name === 'regions') {
        // tables inside the region stay; they just leave it
        const entities = { ...design.entities.byId };
        for (const entityId of design.entities.order) {
            const entity = entities[entityId];
            if (entity.regionId !== id) continue;
            const { regionId: _gone, ...rest } = entity;
            void _gone;
            entities[entityId] = rest;
            inverse.push({
                type: 'entity.update',
                id: entityId,
                patch: { regionId: id },
            });
        }
        next = { ...next, entities: { ...next.entities, byId: entities } };
    }
    return {
        design: next,
        inverse:
            inverse.length === 1
                ? inverse[0]
                : { type: 'group', commands: inverse },
        changed: true,
    };
}

/** A box needs finite numbers and a positive size. */
function checkBox(box: unknown): void {
    const b = box as Record<string, unknown> | null;
    const finite = (v: unknown): v is number =>
        typeof v === 'number' && Number.isFinite(v);
    if (
        !b ||
        typeof b !== 'object' ||
        !finite(b.x) ||
        !finite(b.y) ||
        !finite(b.width) ||
        !finite(b.height)
    )
        fail('invalid', 'box must hold finite x, y, width and height');
    if ((b.width as number) <= 0 || (b.height as number) <= 0)
        fail('invalid', 'box width and height must be positive');
}

function updateItemCommand(
    design: Design,
    command: Extract<Command, { type: 'item.update' }>
): Step {
    const { collection: name, id } = command;
    const patch: Record<string, unknown> = { ...command.patch };
    if ('id' in patch) fail('invalid', 'An id cannot be changed');
    if (
        name === 'regions' &&
        typeof patch.name === 'string' &&
        patch.name.trim() === ''
    )
        delete patch.name;
    for (const key of ['x', 'y', 'width', 'height']) {
        const v = patch[key];
        if (v !== undefined && !(typeof v === 'number' && Number.isFinite(v)))
            fail('invalid', `${key} must be a number`);
    }
    if (patch.box !== undefined) checkBox(patch.box);
    const collection = collectionOfDesign(design, name);
    const item = getItem(collection, id);
    if (!item) return fail('not-found', `No such ${name} entry ${id}`);
    let updated = applyPatch(item, patch);
    if (updated === item) return unchanged(design);
    if (name === 'links') {
        updated = normaliseCardinality(updated as Link);
        checkLink(design, updated as Link);
        // normalising can change a field the patch did not name: undo it too
        for (const key of ['sourceCardinality', 'targetCardinality'] as const)
            if (updated[key as keyof typeof updated] !== (item as Link)[key])
                patch[key] = (updated as Link)[key];
    }
    return {
        design: withCollection(design, name, replaceItem(collection, updated)),
        inverse: {
            type: 'item.update',
            collection: name,
            id,
            patch: inversePatch(item, patch),
        } as Command,
        changed: true,
    };
}

function reorderItemCommand(
    design: Design,
    command: Extract<Command, { type: 'item.reorder' }>
): Step {
    const { collection: name, ids } = command;
    const collection = collectionOfDesign(design, name);
    if (!isPermutation(collection.order, ids))
        fail(
            'invalid',
            `The new order must list every ${name} entry exactly once`
        );
    if (ids.every((id, i) => collection.order[i] === id))
        return unchanged(design);
    return {
        design: withCollection(design, name, reorderItems(collection, ids)),
        inverse: {
            type: 'item.reorder',
            collection: name,
            ids: collection.order.slice(),
        } as Command,
        changed: true,
    };
}
