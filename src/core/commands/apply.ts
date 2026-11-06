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
import { isOpenOnly } from '../model/database';
import type { Design } from '../model/design';
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
    if (options.readOnly || isOpenOnly(design.databaseType))
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
    for (const command of commands) {
        const step = run(current, command);
        if (!step.changed) continue;
        current = step.design;
        inverses.unshift(step.inverse);
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

/** Writes `after` in place of `before` (the same entity's own records). */
function writeParts(
    design: Design,
    before: EntityParts,
    after: EntityParts
): Design {
    const columns = { ...design.columns };
    const keys = { ...design.keys };
    const rules = { ...design.rules };
    for (const c of before.columns) delete columns[c.id];
    for (const k of before.keys) delete keys[k.id];
    for (const r of before.rules) delete rules[r.id];
    for (const c of after.columns) {
        if (Object.hasOwn(columns, c.id))
            fail('invalid', `Column id ${c.id} is already used`);
        columns[c.id] = c;
    }
    for (const k of after.keys) {
        if (Object.hasOwn(keys, k.id))
            fail('invalid', `Index id ${k.id} is already used`);
        keys[k.id] = k;
    }
    for (const r of after.rules) {
        if (Object.hasOwn(rules, r.id))
            fail('invalid', `Check constraint id ${r.id} is already used`);
        rules[r.id] = r;
    }
    return {
        ...design,
        entities: replaceItem(design.entities, after.entity),
        columns,
        keys,
        rules,
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
    const collection = collectionOfDesign(design, name);
    const item = getItem(collection, id);
    if (!item) return fail('not-found', `No such ${name} entry ${id}`);
    let updated = applyPatch(item, patch);
    if (updated === item) return unchanged(design);
    if (name === 'links') {
        updated = normaliseCardinality(updated as Link);
        checkLink(design, updated as Link);
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
