import { COLLAPSED_COLUMNS, TABLE_WIDTH } from '@/core/model/entity';
import { maxBy } from '@/core/model/extent';

/** One box to place: its size and which boxes it is linked to. */
export interface LayoutNode {
    id: string;
    group: string;
    columnCount: number;
    neighbours: readonly string[];
}

export interface Placed {
    x: number;
    y: number;
}

const GAP = 100;
const ORIGIN = 100;
const SPACING = 20;
const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 48;

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** The drawn height of a table card with `columnCount` columns. */
export function cardHeight(columnCount: number): number {
    const shown = Math.min(columnCount, COLLAPSED_COLUMNS);
    return (
        HEADER_HEIGHT +
        shown * ROW_HEIGHT +
        (columnCount > shown ? ROW_HEIGHT : 0)
    );
}

const overlaps = (a: Rect, b: Rect): boolean =>
    a.x < b.x + b.w + SPACING &&
    b.x < a.x + a.w + SPACING &&
    a.y < b.y + b.h + SPACING &&
    b.y < a.y + a.h + SPACING;

function freeAt(rect: Rect, placed: Rect[]): boolean {
    return rect.x >= 0 && rect.y >= 0 && !placed.some((p) => overlaps(rect, p));
}

/** Lays out one schema group, below `top`. Returns where each node went and the group's bottom edge. */
function layoutGroup(
    nodes: LayoutNode[],
    top: number,
    left: number
): { spots: Map<string, Rect>; bottom: number } {
    const w = TABLE_WIDTH.default;
    const spots = new Map<string, Rect>();
    const inGroup = new Set(nodes.map((n) => n.id));
    const degree = (n: LayoutNode): number =>
        n.neighbours.filter((id) => inGroup.has(id)).length;
    const connected = nodes
        .filter((n) => degree(n) > 0)
        .sort((a, b) => degree(b) - degree(a));
    const alone = nodes.filter((n) => degree(n) === 0);
    const placed: Rect[] = [];
    const put = (node: LayoutNode, x: number, y: number): void => {
        const rect = { x, y, w, h: cardHeight(node.columnCount) };
        spots.set(node.id, rect);
        placed.push(rect);
    };

    let frontier = left;
    for (const node of connected) {
        const h = cardHeight(node.columnCount);
        const anchorId = node.neighbours.find((id) => spots.has(id));
        if (!anchorId) {
            // a new cluster starts to the right of everything placed so far
            put(node, frontier, top);
            frontier += w + GAP;
            continue;
        }
        const a = spots.get(anchorId)!;
        const tries: Rect[] = [
            { x: a.x + a.w + GAP, y: a.y, w, h },
            { x: a.x, y: a.y + a.h + GAP, w, h },
            { x: a.x - w - GAP, y: a.y, w, h },
            { x: a.x, y: a.y - h - GAP, w, h },
        ];
        let spot = tries.find((r) => freeAt(r, placed));
        for (let step = 1; !spot; step++) {
            const r = { x: a.x + a.w + GAP, y: a.y + step * (h + GAP), w, h };
            if (freeAt(r, placed)) spot = r;
            else {
                const left2 = {
                    x: a.x + (a.w + GAP) * (step + 1),
                    y: a.y,
                    w,
                    h,
                };
                if (freeAt(left2, placed)) spot = left2;
            }
        }
        put(node, Math.max(spot.x, 0), Math.max(spot.y, 0));
        frontier = Math.max(frontier, spot.x + w + GAP);
    }

    let bottom = placed.reduce((m, r) => Math.max(m, r.y + r.h), top);
    const startY = placed.length > 0 ? bottom + GAP : top;
    const perRow = 4;
    let rowTop = startY;
    for (let i = 0; i < alone.length; i += perRow) {
        const row = alone.slice(i, i + perRow);
        row.forEach((node, k) => put(node, left + k * (w + GAP), rowTop));
        const tallest = maxBy(row, (n) => cardHeight(n.columnCount));
        bottom = Math.max(bottom, rowTop + tallest);
        rowTop += tallest + GAP;
    }
    return { spots, bottom };
}

/**
 * Places every table (IMP-043): each schema group on its own band, linked
 * tables next to their neighbours (most linked first), unlinked tables in
 * a grid below. Groups are stacked, so tables never overlap across groups.
 */
export function layoutTables(
    nodes: readonly LayoutNode[],
    origin: Placed = { x: ORIGIN, y: ORIGIN }
): Map<string, Placed> {
    const groups = new Map<string, LayoutNode[]>();
    for (const node of nodes) {
        const list = groups.get(node.group);
        if (list) list.push(node);
        else groups.set(node.group, [node]);
    }
    const out = new Map<string, Placed>();
    let top = origin.y;
    for (const group of groups.values()) {
        const { spots, bottom } = layoutGroup(group, top, origin.x);
        for (const [id, rect] of spots) out.set(id, { x: rect.x, y: rect.y });
        top = bottom + GAP * 2;
    }
    return out;
}
