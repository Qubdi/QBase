import type { Command } from '@/core/commands/command';
import {
    makeClip,
    planAddEntity,
    planDeleteEntities,
    planDuplicateEntity,
    planPaste,
} from '@/core/commands/plan-entity';
import {
    planDeleteDependency,
    planDependency,
} from '@/core/commands/plan-dependency';
import { planDeleteLink, planLink } from '@/core/commands/plan-link';
import { planAddNote, planAddRegion } from '@/core/commands/plan-visual';
import type { Design } from '@/core/model/design';
import type { Entity, EntityKind } from '@/core/model/entity';
import type { Id } from '@/core/model/id';
import { anchorExists, type MemoAnchor } from '@/core/model/memo';
import { nearestOwner } from '@/core/model/memo-owner';
import { REGION_SIZE } from '@/core/model/region';
import type { Size } from '@/core/model/region-membership';
import type { EditorStore } from '@/store/editor-store';
import { planArrange, planMoveToArea } from './auto-arrange';
import { findFreeShift } from './placement';
import { sizeFor } from './geometry';
import type { ArrangeScope } from './auto-arrange';
import { countPaste, recall, remember } from './clipboard';
import { handleId, parseHandle } from './flow-model';
import type { Point } from './flow-model';

type Measure = (entity: Entity) => Size;

const PLACE_GAP = 24;

const estimate: Measure = (entity) => sizeFor(entity, {});

/** Boxes of every table in the design, as drawn. */
function tableBoxes(design: Design, measure: Measure) {
    return design.entities.order.map((id) => {
        const e = design.entities.byId[id];
        return { x: e.x, y: e.y, ...measure(e) };
    });
}

/** Slides the inserts of a command clear of the existing tables (EDT-038 stays for hand drags). */
function clearOfTables(
    design: Design,
    command: Command,
    measure: Measure
): Command {
    const inserts = command.type === 'group' ? command.commands : [command];
    const entities = inserts.flatMap((c) =>
        c.type === 'entity.insert' ? [c.parts.entity] : []
    );
    const group = entities.map((e) => ({ x: e.x, y: e.y, ...measure(e) }));
    const { dx, dy } = findFreeShift(
        group,
        tableBoxes(design, measure),
        PLACE_GAP
    );
    if (dx === 0 && dy === 0) return command;
    const shifted = (c: Command): Command =>
        c.type === 'entity.insert'
            ? {
                  ...c,
                  parts: {
                      ...c.parts,
                      entity: {
                          ...c.parts.entity,
                          x: c.parts.entity.x + dx,
                          y: c.parts.entity.y + dy,
                      },
                  },
              }
            : c;
    return command.type === 'group'
        ? { ...command, commands: command.commands.map(shifted) }
        : shifted(command);
}

/**
 * Removes everything selected as one step (EDT-031). Links that go with a
 * removed table are not removed twice.
 */
export function deleteSelection(store: EditorStore): boolean {
    const { design, ui } = store.getState();
    const chosen = new Set(ui.selection);
    const entityIds = design.entities.order.filter((id) => chosen.has(id));
    const gone = new Set(entityIds);
    const commands: Command[] = [];
    if (entityIds.length > 0) commands.push(planDeleteEntities(entityIds));
    for (const id of design.links.order) {
        const link = design.links.byId[id];
        if (
            chosen.has(id) &&
            !gone.has(link.sourceEntityId) &&
            !gone.has(link.targetEntityId)
        )
            commands.push(planDeleteLink(id));
    }
    // a dependency goes with its table or view, in the same step
    for (const dep of design.dependencies)
        if (
            chosen.has(dep.id) &&
            !gone.has(dep.tableId) &&
            !gone.has(dep.dependentTableId)
        )
            commands.push(planDeleteDependency(dep.id));
    for (const id of design.regions.order)
        if (chosen.has(id))
            commands.push({ type: 'item.remove', collection: 'regions', id });
    // a note goes with its table, column or area: deleting it twice would be refused
    const goneWith = new Set<string>([
        ...gone,
        ...[...gone].flatMap((id) => design.entities.byId[id]?.columnIds ?? []),
        ...design.regions.order.filter((id) => chosen.has(id)),
    ]);
    for (const id of design.memos.order) {
        const anchor = design.memos.byId[id].anchor;
        if (chosen.has(id) && !(anchor && goneWith.has(anchor.id)))
            commands.push({ type: 'item.remove', collection: 'memos', id });
    }
    if (commands.length === 0) return false;
    const result = store
        .getState()
        .edit({ type: 'group', label: 'delete', commands });
    if (result.ok) store.getState().select([]);
    return result.ok;
}

/** A new table or view at a point; it is selected. Returns its id. */
export function addEntityAt(
    store: EditorStore,
    kind: EntityKind,
    at: Point,
    visibleSchemas?: readonly string[],
    measure: Measure = estimate
): Id | undefined {
    const state = store.getState();
    const planned = planAddEntity(state.design, {
        kind,
        x: Math.round(at.x),
        y: Math.round(at.y),
        visibleSchemas,
    });
    const command = clearOfTables(state.design, planned, measure);
    if (command.type !== 'entity.insert') return undefined;
    const result = state.edit(command);
    if (!result.ok) return undefined;
    state.select([command.parts.entity.id]);
    return command.parts.entity.id;
}

export function addRegionAt(store: EditorStore, at: Point): Id | undefined {
    const state = store.getState();
    const command = planAddRegion(state.design, {
        box: { x: Math.round(at.x), y: Math.round(at.y), ...REGION_SIZE },
    });
    if (command.type !== 'item.insert' || command.collection !== 'regions')
        return undefined;
    if (!state.edit(command).ok) return undefined;
    state.select([command.item.id]);
    return command.item.id;
}

/**
 * Adds a note attached to an area, a table or a column. It is put at `at` when
 * given (a drop), else to the right of what it belongs to.
 */
export function addNoteTo(
    store: EditorStore,
    anchor: MemoAnchor,
    at?: Point
): Id | undefined {
    const state = store.getState();
    const command = planAddNote(state.design, anchor, {
        ...(at ? { at: { x: Math.round(at.x), y: Math.round(at.y) } } : {}),
    });
    if (command.type !== 'item.insert' || command.collection !== 'memos')
        return undefined;
    if (!state.edit(command).ok) return undefined;
    state.select([command.item.id]);
    return command.item.id;
}

/**
 * Adds a note where it was dropped. It is attached to the column the drop
 * landed on (`columnId`, read from the row under the pointer), else to the
 * area it lies in or the nearest table.
 */
export function addNoteAt(
    store: EditorStore,
    at: Point,
    columnId?: Id
): Id | undefined {
    const design = store.getState().design;
    const onColumn: MemoAnchor | undefined = columnId
        ? { kind: 'column', id: columnId }
        : undefined;
    const owner =
        onColumn && anchorExists(design, onColumn)
            ? onColumn
            : nearestOwner(design, at.x, at.y);
    return owner ? addNoteTo(store, owner, at) : undefined;
}

export function duplicateEntity(
    store: EditorStore,
    id: Id,
    measure: Measure = estimate
): Id | undefined {
    const state = store.getState();
    const planned = planDuplicateEntity(state.design, id);
    if (!planned) return undefined;
    const command = clearOfTables(state.design, planned, measure);
    if (command.type !== 'entity.insert') return undefined;
    if (!state.edit(command).ok) return undefined;
    state.select([command.parts.entity.id]);
    return command.parts.entity.id;
}

export type ConnectOutcome =
    | { kind: 'created'; linkId: Id }
    | { kind: 'exists'; linkId: Id }
    | { kind: 'incompatible' }
    | { kind: 'refused' };

interface End {
    entityId: Id;
    columnId: Id;
}

/**
 * What releasing a drag between two field dots does (EDT-153 to EDT-157): the
 * first end is the source. Nothing is created for an incompatible pair, an
 * existing pair, or a view.
 */
export function connectColumns(
    store: EditorStore,
    from: End,
    to: End
): ConnectOutcome {
    const state = store.getState();
    const plan = planLink(state.design, from, to);
    if (plan.kind === 'exists') return { kind: 'exists', linkId: plan.link.id };
    if (plan.kind === 'refused')
        return plan.reason === 'incompatible'
            ? { kind: 'incompatible' }
            : { kind: 'refused' };
    const result = state.edit(plan.command);
    return result.ok
        ? { kind: 'created', linkId: plan.link.id }
        : { kind: 'refused' };
}

/** Mod+C: remembers the selected tables; returns how many (EDT-227). */
export function copySelection(store: EditorStore): number {
    const { design, ui } = store.getState();
    const ids = design.entities.order.filter((id) => ui.selection.includes(id));
    if (ids.length === 0) return 0;
    remember(makeClip(design, ids));
    return ids.length;
}

/** Mod+V: pastes what was copied; returns the number of tables added (EDT-230). */
export function pasteClipboard(
    store: EditorStore,
    measure: Measure = estimate
): number {
    const held = recall();
    const state = store.getState();
    if (!held || state.session.readonly) return 0;
    const planned = planPaste(state.design, held.clip, held.pastes);
    if (!planned) return 0;
    const command = clearOfTables(state.design, planned, measure);
    if (command.type !== 'group') return 0;
    if (!state.edit(command).ok) return 0;
    countPaste();
    state.select(
        command.commands.flatMap((c) =>
            c.type === 'entity.insert' ? [c.parts.entity.id] : []
        )
    );
    return command.commands.length;
}

export function moveToArea(
    store: EditorStore,
    ids: readonly Id[],
    regionId: Id | undefined,
    measure: Measure
): boolean {
    const state = store.getState();
    const command = planMoveToArea(state.design, ids, regionId, measure);
    return command ? state.edit(command).ok : false;
}

export function arrangeDiagram(
    store: EditorStore,
    scope: ArrangeScope,
    measure: Measure
): boolean {
    const state = store.getState();
    const command = planArrange(state.design, scope, measure);
    return command ? state.edit(command).ok : false;
}

/** Entities inside a region, used by the area menu's Auto Arrange. */
export function membersOf(design: Design, regionId: Id): Id[] {
    return design.entities.order.filter(
        (id) => design.entities.byId[id].regionId === regionId
    );
}

interface HandleConnection {
    source: string | null;
    target: string | null;
    sourceHandle?: string | null;
    targetHandle?: string | null;
}

/** The two field ends a finished connection joins, or undefined if it is not one. */
export function endsOf(
    connection: HandleConnection
): { from: End; to: End } | undefined {
    const a = parseHandle(connection.sourceHandle);
    const b = parseHandle(connection.targetHandle);
    if (!connection.source || !connection.target || !a || !b) return undefined;
    return {
        from: { entityId: connection.source, columnId: a.columnId },
        to: { entityId: connection.target, columnId: b.columnId },
    };
}

/** True unless a field would be joined to itself. */
export function isUsableConnection(connection: HandleConnection): boolean {
    const ends = endsOf(connection);
    return (
        ends !== undefined &&
        !(
            ends.from.entityId === ends.to.entityId &&
            ends.from.columnId === ends.to.columnId
        )
    );
}

/** A drag from one field dot to another has been released on a dot. */
export function connectFromHandles(
    store: EditorStore,
    connection: HandleConnection
): ConnectOutcome | undefined {
    const ends = endsOf(connection);
    if (!ends || !isUsableConnection(connection)) return undefined;
    return connectColumns(store, ends.from, ends.to);
}

/**
 * A drag from a field dot has been released on a field row but not on one of
 * its dots (the middle of the row, say): it joins the same two fields as a
 * release on a dot. `over` is the element under the pointer. Nothing happens
 * unless it is inside a field row of a table on the canvas.
 */
export function connectFromDrop(
    store: EditorStore,
    from: { nodeId: string; handleId?: string | null },
    over: Element | null | undefined
): ConnectOutcome | undefined {
    const row = over?.closest('[data-testid^="field-"]');
    const node = over?.closest('.react-flow__node-entity');
    const columnId = row?.getAttribute('data-testid')?.slice('field-'.length);
    const entityId = node?.getAttribute('data-id');
    if (!columnId || !entityId) return undefined;
    // the row must really be a field of that table: a look-alike test id is not one
    const design = store.getState().design;
    if (!design.entities.byId[entityId]?.columnIds.includes(columnId))
        return undefined;
    // the side does not matter to the link, only the two fields do
    return connectFromHandles(store, {
        source: from.nodeId,
        sourceHandle: from.handleId,
        target: entityId,
        targetHandle: handleId(columnId, 'l'),
    });
}

/**
 * A drag that started on a view's top or bottom dot has been released over a
 * table (EDT-183): the view now reads that table. No dialog; an existing pair
 * is left as it is. Returns the dependency's id when one was made.
 */
export function connectDependency(
    store: EditorStore,
    viewId: Id,
    tableId: Id
): Id | undefined {
    const state = store.getState();
    const plan = planDependency(state.design, viewId, tableId);
    if (plan.kind !== 'ok') return undefined;
    return state.edit(plan.command).ok ? plan.dependency.id : undefined;
}
