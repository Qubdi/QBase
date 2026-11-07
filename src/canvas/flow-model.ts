import type { Edge, Node } from '@xyflow/react';
import type { Design } from '@/core/model/design';
import { TABLE_WIDTH } from '@/core/model/entity';
import type { Id } from '@/core/model/id';
import { entityList } from '@/core/model/lookup';
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
    /** how a diff preview marks this table */
    mark?: DiffMark;
    /** the name before a renamed table's new one */
    renamedFrom?: string;
};
export type RegionNodeData = Record<string, never>;
export type MemoNodeData = Record<string, never>;

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
};
export type LinkEdge = Edge<LinkEdgeData, 'link'>;

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
    return new Set(design.entities.order.filter((id) => !near.has(id)));
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

export function buildNodes(
    input: FlowInput,
    memory?: NodeMemory
): CanvasNode[] {
    const { design, selection, live } = input;
    const dim = dimmedEntities(design, selection);
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
                data: {},
                selected: selection.has(id),
                draggable: input.editable,
                zIndex: -1,
            })
        );
    }
    for (const id of design.memos.order) {
        const memo = design.memos.byId[id];
        const at = live.positions[id] ?? memo.box;
        const size = live.sizes[id] ?? memo.box;
        nodes.push(
            remembered<MemoNode>(memory, {
                id,
                type: 'memo',
                position: { x: at.x, y: at.y },
                width: size.width,
                height: size.height ?? memo.box.height,
                data: {},
                selected: selection.has(id),
                draggable: input.editable,
                zIndex: 0,
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
                    mark: input.diff?.tables[entity.id],
                    renamedFrom: input.diff?.renames?.[entity.id],
                },
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
            selected: input.selection.has(id),
            data: {
                reach: (selfLoop ? 36 : 22) + n * 14,
                selfLoop,
                mark: input.diff?.links[id],
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
