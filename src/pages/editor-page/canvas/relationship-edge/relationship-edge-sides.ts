// Which side of each table a relationship line attaches to.
//
// The line joins the pair of sides (left/right of the source table, left/right
// of the target table) that are closest to each other. When two pairs are almost
// equally close, a tiny mouse movement used to flip the line from one side of
// a table to the other and back again. To stop that, the line keeps the pair it
// already has unless another one is clearly better.

export type Side = 'left' | 'right';

export interface Sides {
    sourceSide: Side;
    targetSide: Side;
}

export interface Anchors {
    sourceLeftX: number;
    sourceRightX: number;
    targetLeftX: number;
    targetRightX: number;
}

/** How much closer (in canvas units) another pair must be before the line moves to it. */
export const SIDE_SWITCH_MARGIN = 24;

const distanceFor = (a: Anchors, s: Sides): number => {
    const sx = s.sourceSide === 'left' ? a.sourceLeftX : a.sourceRightX;
    const tx = s.targetSide === 'left' ? a.targetLeftX : a.targetRightX;
    return Math.abs(sx - tx);
};

// The order matters: on an exact tie the first of these wins.
const PAIRS: Sides[] = [
    { sourceSide: 'left', targetSide: 'left' },
    { sourceSide: 'left', targetSide: 'right' },
    { sourceSide: 'right', targetSide: 'left' },
    { sourceSide: 'right', targetSide: 'right' },
];

/** The closest pair of sides, ignoring where the line was before. */
export function closestSides(anchors: Anchors): Sides {
    let best = PAIRS[0];
    let bestDistance = distanceFor(anchors, best);
    for (const pair of PAIRS.slice(1)) {
        const d = distanceFor(anchors, pair);
        if (d < bestDistance) {
            best = pair;
            bestDistance = d;
        }
    }
    return best;
}

/**
 * The sides to draw the line on. With no earlier choice this is simply the
 * closest pair; otherwise the earlier pair is kept unless a new one is closer
 * by more than `margin`.
 */
export function chooseSides(
    anchors: Anchors,
    previous: Sides | null,
    margin = SIDE_SWITCH_MARGIN
): Sides {
    const best = closestSides(anchors);
    if (!previous) return best;
    if (
        previous.sourceSide === best.sourceSide &&
        previous.targetSide === best.targetSide
    ) {
        return previous;
    }
    const keep = distanceFor(anchors, previous);
    const move = distanceFor(anchors, best);
    return keep - move > margin ? best : previous;
}
