export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

const GAP = 60;
const DEFAULT_WIDTH = 224;
const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 48;

/** Rough on-canvas size of a table, good enough to avoid overlaps. */
export function estimateBox(table: {
    x: number;
    y: number;
    width?: number | null;
    fields: unknown[];
}): Box {
    return {
        x: table.x,
        y: table.y,
        width: table.width ?? DEFAULT_WIDTH,
        height: HEADER_HEIGHT + Math.min(table.fields.length, 10) * ROW_HEIGHT,
    };
}

const overlaps = (a: Box, b: Box, gap = 0) =>
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y;

/**
 * Finds a free spot for a new table. With anchors (the tables it relates to)
 * it tries positions right of, below, left of and above them, nearest first.
 * Without anchors it goes to the right of everything.
 */
export function findFreeSpot(
    size: { width: number; height: number },
    anchors: Box[],
    occupied: Box[]
): { x: number; y: number } {
    const free = (x: number, y: number) => {
        const candidate: Box = {
            x,
            y,
            width: size.width,
            height: size.height,
        };
        return !occupied.some((o) => overlaps(candidate, o, GAP / 2));
    };

    if (anchors.length === 0) {
        if (occupied.length === 0) return { x: 0, y: 0 };
        const right = Math.max(...occupied.map((o) => o.x + o.width));
        const top = Math.min(...occupied.map((o) => o.y));
        let y = top;
        while (!free(right + GAP, y)) y += size.height + GAP;
        return { x: right + GAP, y };
    }

    for (let ring = 0; ring < 40; ring++) {
        for (const a of anchors) {
            const dx = a.width + GAP + ring * (size.width + GAP);
            const dy = a.height + GAP + ring * (size.height + GAP);
            const options = [
                { x: a.x + dx, y: a.y },
                { x: a.x, y: a.y + dy },
                {
                    x: a.x - size.width - GAP - ring * (size.width + GAP),
                    y: a.y,
                },
                {
                    x: a.x,
                    y: a.y - size.height - GAP - ring * (size.height + GAP),
                },
                { x: a.x + dx, y: a.y + dy },
            ];
            for (const o of options) {
                if (free(o.x, o.y)) return o;
            }
        }
    }
    // pathological layouts: fall back to the right edge
    const right = Math.max(...occupied.map((o) => o.x + o.width));
    return { x: right + GAP, y: anchors[0].y };
}
