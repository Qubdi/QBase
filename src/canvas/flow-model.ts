import type { Edge, Node } from '@xyflow/react';
import type { Design } from '@/core/model/design';
import { TABLE_WIDTH } from '@/core/model/entity';
import type { Id } from '@/core/model/id';
import { entityList } from '@/core/model/lookup';
import { memoPosition, tiePoint } from '@/core/model/memo';
import type { Size } from '@/core/model/region-membership';
import type { DiffMark, DiffMarks } from './diff-marks';

export type Side = 'l' | 'r';

export interface Point {
    x: number;
    y: number;
}

/** Positions and sizes being dragged or resized, before they are committed. */
export interface LiveShapes {
    positions: Readonly<Record<Id, Point>>;
    sizes: Readonly<Record<Id, { width: number; height?: number }>>;
}

export const NO_LIVE: LiveShapes = { positions: {}, sizes: {} };

export type EntityNodeData = {
    /** fades out: neither selected nor linked to a selected table */
    dimmed: boolean;
    /** flashes red for a moment (overlap warning) */
    flashing: boolean;
    /** carries the quiet overlap outline */
    outlined: boolean;
    /** how many other tables this one overlaps while the overlap highlight is on */
    overlapCount: number;
    /** how a diff preview marks this table */
    mark?: DiffMark;
    /** the name before a renamed table's new one */
    renamedFrom?: string;
};
export type RegionNodeData = {
    /** fades out: none of its tables is selected or linked to a selected table */
    dimmed: boolean;
};
export type MemoNodeData = {
    /** where the line to what the note belongs to ends, from the note's top-left corner */
    tieX?: number;
    tieY?: number;
};

export type EntityNode = Node<EntityNodeData, 'entity'>;
export type RegionNode = Node<RegionNodeData, 'region'>;
export type MemoNode = Node<MemoNodeData, 'memo'>;
export type CanvasNode = EntityNode | RegionNode | MemoNode;

export type LinkEdgeData = {
    /** distance a parallel or looping line keeps from the table edge */
    reach: number;
    selfLoop: boolean;
    /** how a diff preview marks this line */
    mark?: DiffMark;
    /** a table at one end stands back (EDT-032), so the line does too */
    dimmed?: boolean;
};
export type LinkEdge = Edge<LinkEdgeData, 'link'>;

/** A view reads a table (EDT-184): drawn from the view's top or bottom dot. */
export type DependencyEdgeData = { reach: number; dimmed?: boolean };
export type DependencyEdge = Edge<DependencyEdgeData, 'dependency'>;

export type DepSide = 't' | 'b';

/** The dots a view and a table offer to dependencies: top and bottom centre. */
export const dependencyHandleId = (side: DepSide) => `d:${side}`;

export function parseDependencyHandle(
    id: string | null | undefined
): DepSide | undefined {
    return id === 'd:t' ? 't' : id === 'd:b' ? 'b' : undefined;
}

/** A handle id names a column and the side of the table it sits on. */
export const handleId = (columnId: Id, side: Side) => `c:${columnId}:${side}`;

export function parseHandle(
    id: string | null | undefined
): { columnId: Id; side: Side } | undefined {
    const match = /^c:(.+):([lr])$/.exec(id ?? '');
    return match ? { columnId: match[1], side: match[2] as Side } : undefined;
}

export interface FlowInput {
    design: Design;
    selection: ReadonlySet<Id>;
    /** entities the filter lets through and the views switch allows */
    visible: ReadonlySet<Id>;
    live: LiveShapes;
    flashing: ReadonlySet<Id>;
    overlapping: ReadonlySet<Id>;
    /** how many tables each overlapping table touches (none counted when absent) */
    overlapCounts?: ReadonlyMap<Id, number>;
    /** the overlap highlight (toggle or View menu) is on; off when absent */
    highlightOverlaps?: boolean;
    /** the measured size of each drawn table, as reported by the canvas */
    sizes: Readonly<Record<Id, Size>>;
    outlineOverlaps: boolean;
    editable: boolean;
    diff?: DiffMarks;
}

/** Tables that stand back while others are selected (EDT-032). */
export function dimmedEntities(
    design: Design,
    selection: ReadonlySet<Id>
): Set<Id> {
    const picked = new Set<Id>(
        design.entities.order.filter((id) => selection.has(id))
    );
    if (picked.size === 0) return new Set();
    const near = new Set<Id>(picked);
    for (const id of design.links.order) {
        const link = design.links.byId[id];
        if (picked.has(link.sourceEntityId)) near.add(link.targetEntityId);
        if (picked.has(link.targetEntityId)) near.add(link.sourceEntityId);
    }
    for (const dep of design.dependencies) {
        if (picked.has(dep.tableId)) near.add(dep.dependentTableId);
        if (picked.has(dep.dependentTableId)) near.add(dep.tableId);
    }
    return new Set(design.entities.order.filter((id) => !near.has(id)));
}

/**
 * Areas that stand back with their tables: while tables are selected, an area
 * stays bright when at least one of its tables is selected or linked to the
 * selection, and fades when none is (an empty area fades too).
 */
export function dimmedRegions(
    design: Design,
    selection: ReadonlySet<Id>,
    dimmedTables: ReadonlySet<Id> = dimmedEntities(design, selection)
): Set<Id> {
    const picking = design.entities.order.some((id) => selection.has(id));
    if (!picking) return new Set();
    return new Set(
        design.regions.order.filter(
            (regionId) =>
                !design.entities.order.some(
                    (id) =>
                        design.entities.byId[id].regionId === regionId &&
                        !dimmedTables.has(id)
                )
        )
    );
}

/** The ids that are drawn: filter first, then the views switch. */
export function drawnEntityIds(
    design: Design,
    passesFilter: (id: Id) => boolean,
    showViews: boolean
): Set<Id> {
    return new Set(
        design.entities.order.filter(
            (id) =>
                passesFilter(id) &&
                (showViews || design.entities.byId[id].kind !== 'view')
        )
    );
}

/** How far past facing, in pixels, a link keeps the sides it already has. */
export const SIDE_MARGIN = 48;

/**
 * Which sides a link joins, so the line leaves the edges that face each other.
 * With `previous` the old sides are kept while they are still acceptable
 * within `SIDE_MARGIN`, so a table that wobbles does not make the line flip.
 */
export function chooseSides(
    source: { x: number; width: number },
    target: { x: number; width: number },
    selfLoop: boolean,
    previous?: readonly [Side, Side]
): [Side, Side] {
    if (selfLoop) return ['r', 'r'];
    const gapRight = target.x - (source.x + source.width); // > 0: target is right of source
    const gapLeft = source.x - (target.x + target.width);
    if (previous) {
        const [a, b] = previous;
        if (a === 'r' && b === 'l' && gapRight >= -SIDE_MARGIN)
            return ['r', 'l'];
        if (a === 'l' && b === 'r' && gapLeft >= -SIDE_MARGIN)
            return ['l', 'r'];
        if (a === b && gapRight < SIDE_MARGIN && gapLeft < SIDE_MARGIN)
            return [a, b];
    }
    if (gapRight >= 0) return ['r', 'l'];
    if (gapLeft >= 0) return ['l', 'r'];
    return ['r', 'r'];
}

/**
 * The object handed to xyflow for a node: the one built last time when
 * nothing about it changed, so xyflow can skip the nodes that did not move
 * (a drag changes one table, not two hundred).
 */
export type NodeMemory = Map<Id, CanvasNode>;

const sameValues = (a: object, b: object): boolean => {
    const x = a as Record<string, unknown>;
    const y = b as Record<string, unknown>;
    const keys = Object.keys(x);
    return (
        keys.length === Object.keys(y).length &&
        keys.every((key) => Object.is(x[key], y[key]))
    );
};

function sameNode(a: CanvasNode, b: CanvasNode): boolean {
    const { data: dataA, position: posA, measured: mA, ...restA } = a;
    const { data: dataB, position: posB, measured: mB, ...restB } = b;
    return (
        sameValues(restA, restB) &&
        sameValues(dataA, dataB) &&
        sameValues(posA, posB) &&
        (mA === mB ||
            (mA !== undefined && mB !== undefined && sameValues(mA, mB)))
    );
}

/** `fresh` unless `memory` holds an equal node, which is then kept. */
function remembered<T extends CanvasNode>(
    memory: NodeMemory | undefined,
    fresh: T
): T {
    if (!memory) return fresh;
    const before = memory.get(fresh.id);
    if (before && sameNode(before, fresh)) return before as T;
    memory.set(fresh.id, fresh);
    return fresh;
}

/** Ids in reading order: top-left to bottom-right, rows being bands of 80 px. */
export function readingOrder(nodes: readonly CanvasNode[]): Id[] {
    const band = (n: CanvasNode) => Math.round(n.position.y / 80);
    return [...nodes]
        .sort(
            (a, b) =>
                band(a) - band(b) ||
                a.position.x - b.position.x ||
                a.position.y - b.position.y
        )
        .map((n) => n.id);
}

/**
 * `nodes` listed in the order of `ids` (the order Tab walks through them);
 * a node that is not in `ids` goes last.
 */
export function inOrder(
    nodes: readonly CanvasNode[],
    ids: readonly Id[]
): CanvasNode[] {
    const rank = new Map(ids.map((id, i) => [id, i]));
    return [...nodes].sort(
        (a, b) =>
            (rank.get(a.id) ?? ids.length) - (rank.get(b.id) ?? ids.length)
    );
}

/**
 * `built` in Tab order. The order is held (in `memory`) while a node has the
 * focus and the same tables are drawn: moving the element that holds the focus
 * in the page would drop the focus. Otherwise it is read afresh.
 */
export function orderedNodes(
    built: readonly CanvasNode[],
    memory: { held: Id[] }
): CanvasNode[] {
    const known = new Set(memory.held);
    const focusedNode =
        typeof document !== 'undefined' &&
        document.activeElement?.closest?.('.react-flow__node');
    if (!(
        focusedNode &&
        memory.held.length === built.length &&
        built.every((n) => known.has(n.id))
    ))
        memory.held = readingOrder(built);
    return inOrder(built, memory.held);
}

export function buildNodes(
    input: FlowInput,
    memory?: NodeMemory
): CanvasNode[] {
    const { design, selection, live } = input;
    const dim = dimmedEntities(design, selection);
    const dimRegions = dimmedRegions(design, selection, dim);
    const nodes: CanvasNode[] = [];
    for (const id of design.regions.order) {
        const region = design.regions.byId[id];
        const at = live.positions[id] ?? region.box;
        const size = live.sizes[id] ?? region.box;
        nodes.push(
            remembered<RegionNode>(memory, {
                id,
                type: 'region',
                position: { x: at.x, y: at.y },
                width: size.width,
                height: size.height ?? region.box.height,
                data: { dimmed: dimRegions.has(id) },
                ariaLabel: region.label,
                selected: selection.has(id),
                draggable: input.editable,
                zIndex: -10,
            })
        );
    }
    for (const id of design.memos.order) {
        const memo = design.memos.byId[id];
        // a note is where its owner puts it, unless the note itself is being dragged
        const at =
            live.positions[id] ?? memoPosition(design, memo, live.positions);
        const size = live.sizes[id] ?? memo.box;
        const tie = tiePoint(design, memo, at, live.positions);
        nodes.push(
            remembered<MemoNode>(memory, {
                id,
                type: 'memo',
                position: { x: at.x, y: at.y },
                width: size.width,
                height: size.height ?? memo.box.height,
                data: tie
                    ? {
                          tieX: Math.round(tie.x - at.x),
                          tieY: Math.round(tie.y - at.y),
                      }
                    : {},
                ariaLabel: memo.body.trim().slice(0, 60) || undefined,
                selected: selection.has(id),
                draggable: input.editable,
                zIndex: 50,
            })
        );
    }
    for (const entity of entityList(design)) {
        if (!input.visible.has(entity.id)) continue;
        const at = live.positions[entity.id] ?? entity;
        nodes.push(
            remembered<EntityNode>(memory, {
                id: entity.id,
                type: 'entity',
                position: { x: at.x, y: at.y },
                width:
                    live.sizes[entity.id]?.width ??
                    entity.width ??
                    TABLE_WIDTH.default,
                // what the browser measured, handed back on every rebuild: without it
                // xyflow forgets the field handles of a table each time the nodes are
                // rebuilt, and no line can attach until the next measurement
                measured: input.sizes[entity.id],
                data: {
                    dimmed: dim.has(entity.id),
                    flashing: input.flashing.has(entity.id),
                    outlined:
                        input.outlineOverlaps &&
                        input.overlapping.has(entity.id),
                    overlapCount: input.highlightOverlaps
                        ? (input.overlapCounts?.get(entity.id) ?? 0)
                        : 0,
                    mark: input.diff?.tables[entity.id],
                    renamedFrom: input.diff?.renames?.[entity.id],
                },
                ariaLabel: entity.name,
                selected: selection.has(entity.id),
                draggable: input.editable,
                zIndex: 1,
            })
        );
    }
    // forget what is no longer drawn
    if (memory && memory.size > nodes.length) {
        const drawn = new Set(nodes.map((n) => n.id));
        for (const id of memory.keys()) if (!drawn.has(id)) memory.delete(id);
    }
    return nodes;
}

/**
 * `memory` holds the sides each link had last time; it is read for the
 * hysteresis and updated with the sides chosen now.
 */
export function buildEdges(
    input: FlowInput,
    memory?: Map<Id, [Side, Side]>,
    kept?: Map<Id, LinkEdge>
): LinkEdge[] {
    const { design, live } = input;
    const dim = dimmedEntities(design, input.selection);
    const alive = kept ? new Set<Id>() : undefined;
    const rank = new Map<string, number>();
    const edges: LinkEdge[] = [];
    for (const id of design.links.order) {
        const link = design.links.byId[id];
        if (
            !input.visible.has(link.sourceEntityId) ||
            !input.visible.has(link.targetEntityId)
        )
            continue;
        const from = design.entities.byId[link.sourceEntityId];
        const to = design.entities.byId[link.targetEntityId];
        if (!from || !to) continue;
        const selfLoop = from.id === to.id;
        const place = (e: typeof from) => ({
            x: live.positions[e.id]?.x ?? e.x,
            width: live.sizes[e.id]?.width ?? e.width ?? TABLE_WIDTH.default,
        });
        const [a, b] = chooseSides(
            place(from),
            place(to),
            selfLoop,
            memory?.get(id)
        );
        memory?.set(id, [a, b]);
        const pair = [from.id, to.id].sort().join('|');
        const n = rank.get(pair) ?? 0;
        rank.set(pair, n + 1);
        const edge: LinkEdge = {
            id,
            type: 'link',
            source: from.id,
            target: to.id,
            sourceHandle: handleId(link.sourceColumnId, a),
            targetHandle: handleId(link.targetColumnId, b),
            ariaLabel: `${from.name} - ${to.name}`,
            selected: input.selection.has(id),
            data: {
                reach: (selfLoop ? 36 : 22) + n * 14,
                selfLoop,
                mark: input.diff?.links[id],
                dimmed: dim.has(from.id) || dim.has(to.id),
            },
        };
        // the edge of last time when nothing about it changed
        const before = kept?.get(id);
        const same =
            before !== undefined &&
            sameValues({ ...before, data: 0 }, { ...edge, data: 0 }) &&
            before.data !== undefined &&
            sameValues(before.data, edge.data!);
        if (!same) kept?.set(id, edge);
        alive?.add(id);
        edges.push(same ? before : edge);
    }
    if (kept && alive)
        for (const id of kept.keys()) if (!alive.has(id)) kept.delete(id);
    return edges;
}

/**
 * The lines of the dependencies (EDT-184). The view leaves by its top dot when
 * the table is above it and by its bottom dot when the table is below.
 */
export function buildDependencyEdges(input: FlowInput): DependencyEdge[] {
    const { design, live } = input;
    const dim = dimmedEntities(design, input.selection);
    const edges: DependencyEdge[] = [];
    design.dependencies.forEach((dep, index) => {
        if (
            !input.visible.has(dep.tableId) ||
            !input.visible.has(dep.dependentTableId)
        )
            return;
        const view = design.entities.byId[dep.dependentTableId];
        const table = design.entities.byId[dep.tableId];
        if (!view || !table) return;
        const viewY = live.positions[view.id]?.y ?? view.y;
        const tableY = live.positions[table.id]?.y ?? table.y;
        const tableAbove = tableY < viewY;
        edges.push({
            id: dep.id,
            type: 'dependency',
            source: view.id,
            target: table.id,
            sourceHandle: dependencyHandleId(tableAbove ? 't' : 'b'),
            targetHandle: dependencyHandleId(tableAbove ? 'b' : 't'),
            ariaLabel: `${view.name} - ${table.name}`,
            selected: input.selection.has(dep.id),
            data: {
                reach: 22 + (index % 4) * 6,
                dimmed: dim.has(view.id) || dim.has(table.id),
            },
        });
    });
    return edges;
}
