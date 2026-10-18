import type { Cardinality } from '@/lib/domain/db-relationship';
import { type TableNodeType } from './table-node/table-node';
import { addEdge, createGraph, removeEdge, type Graph } from '@/lib/graph';
import {
    getTableDimensions,
    calcTableHeight,
    type DBTable,
    MIN_TABLE_SIZE,
} from '@/lib/domain/db-table';

export { calcTableHeight, getTableDimensions };

export const getCardinalityMarkerId = ({
    cardinality,
    selected,
    side,
}: {
    cardinality: Cardinality;
    selected: boolean;
    side: 'left' | 'right';
}) =>
    `cardinality_${selected ? 'selected' : 'not_selected'}_${cardinality}_${side}`;

const calcRect = ({
    node,
    table,
}: ExactlyOne<{ table: DBTable; node: TableNodeType }>) => {
    const id = node?.id ?? table?.id ?? '';
    const x = node?.position.x ?? table?.x ?? 0;
    const y = node?.position.y ?? table?.y ?? 0;
    const width =
        node?.measured?.width ??
        node?.data.table.width ??
        table?.width ??
        MIN_TABLE_SIZE;
    const height = node
        ? (node?.measured?.height ?? calcTableHeight(node.data.table))
        : calcTableHeight(table);

    return {
        id,
        left: x,
        right: x + width,
        top: y,
        bottom: y + height,
    };
};

export const findTableOverlapping = (
    {
        node,
        table,
    }: ExactlyOne<{
        node: TableNodeType;
        table: DBTable;
    }>,
    {
        nodes,
        tables,
    }: ExactlyOne<{
        nodes: TableNodeType[];
        tables: DBTable[];
    }>,
    graph: Graph<string>
): Graph<string> => {
    const id = node?.id ?? table?.id ?? '';
    const tableRect = calcRect(node ? { node } : { table });

    for (const otherTable of nodes ?? tables ?? []) {
        if (id === otherTable.id) {
            continue;
        }

        const isNode = !!nodes;

        const otherTableRect = isNode
            ? calcRect({ node: otherTable as TableNodeType })
            : calcRect({ table: otherTable as DBTable });

        if (
            tableRect.left < otherTableRect.right &&
            tableRect.right > otherTableRect.left &&
            tableRect.top < otherTableRect.bottom &&
            tableRect.bottom > otherTableRect.top
        ) {
            graph = addEdge(graph, id, otherTable.id);
        } else {
            graph = removeEdge(graph, id, otherTable.id);
        }
    }

    return graph;
};

export const findOverlappingTables = ({
    tables,
    nodes,
}: ExactlyOne<{
    nodes: TableNodeType[];
    tables: DBTable[];
}>): Graph<string> => {
    let graph = createGraph<string>();

    if (tables) {
        for (const table of tables) {
            graph = findTableOverlapping({ table }, { tables }, graph);
        }
    } else {
        for (const node of nodes) {
            graph = findTableOverlapping({ node }, { nodes }, graph);
        }
    }

    return graph;
};

export interface PlacedRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Space kept between tables that were moved apart. */
export const TABLE_GAP = 24;

const overlaps = (a: PlacedRect, b: PlacedRect, dx: number, dy: number) =>
    a.x + dx < b.x + b.width &&
    a.x + dx + a.width > b.x &&
    a.y + dy < b.y + b.height &&
    a.y + dy + a.height > b.y;

/**
 * How far to shift tables that were just dropped so none of them sits on top of
 * another table: the smallest move that leaves them clear of `others`, or
 * `{ dx: 0, dy: 0 }` when they already are. The dropped tables move together,
 * so tables dragged as a group keep their arrangement.
 */
export const findFreeShift = (
    moved: PlacedRect[],
    others: PlacedRect[],
    gap = TABLE_GAP
): { dx: number; dy: number } => {
    const free = (dx: number, dy: number) =>
        !moved.some((m) => others.some((o) => overlaps(m, o, dx, dy)));
    if (free(0, 0)) return { dx: 0, dy: 0 };

    // the best spot always has a moved table flush against another one
    const dxs = new Set<number>([0]);
    const dys = new Set<number>([0]);
    for (const m of moved) {
        for (const o of others) {
            dxs.add(o.x - gap - (m.x + m.width));
            dxs.add(o.x + o.width + gap - m.x);
            dys.add(o.y - gap - (m.y + m.height));
            dys.add(o.y + o.height + gap - m.y);
        }
    }
    const candidates: { dx: number; dy: number }[] = [];
    for (const dx of dxs) for (const dy of dys) candidates.push({ dx, dy });
    candidates.sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));

    return candidates.find((c) => free(c.dx, c.dy)) ?? { dx: 0, dy: 0 };
};

/**
 * Gives each new node the measured size its previous version had.
 *
 * A node handed to React Flow without `measured` is treated as not drawn yet,
 * and every line that ends on it disappears until the browser measures it
 * again, which is one frame. Nodes are rebuilt from the diagram whenever it
 * changes, for example when a dropped table's new position is saved, and
 * neither a move nor a rename changes a size. A real size change is measured
 * again by React Flow itself, so a carried value never stays wrong.
 */
export const carryMeasured = <
    N extends { id: string; measured?: { width?: number; height?: number } },
>(
    previous: readonly N[],
    next: readonly N[]
): N[] => {
    const before = new Map(previous.map((node) => [node.id, node.measured]));
    return next.map((node) => {
        const measured = before.get(node.id);
        return node.measured || !measured ? node : { ...node, measured };
    });
};
