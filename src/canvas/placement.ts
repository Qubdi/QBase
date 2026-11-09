import type { Box } from '@/core/model/region';
import { minBy, maxBy } from '@/core/model/extent';

export interface Shift {
    dx: number;
    dy: number;
}

const apart = (a: Box, b: Box, gap: number) =>
    a.x < b.x + b.width + gap &&
    b.x < a.x + a.width + gap &&
    a.y < b.y + b.height + gap &&
    b.y < a.y + a.height + gap;

function collides(
    group: readonly Box[],
    others: readonly Box[],
    s: Shift,
    gap: number
) {
    return group.some((g) => {
        const moved = { ...g, x: g.x + s.dx, y: g.y + s.dy };
        return others.some((o) => apart(moved, o, gap));
    });
}

/**
 * The shortest straight move that takes a group of boxes (tables being added
 * together) clear of every other box, keeping `gap` between them (editor 2.7,
 * 17). The group moves as one piece. Returns no shift when nothing overlaps.
 * Candidates are the four ways of clearing each neighbour, plus the four ways
 * of leaving the whole crowd, so there is always an answer; the shortest wins
 * and ties go to horizontal, then downward moves.
 */
export function findFreeShift(
    group: readonly Box[],
    others: readonly Box[],
    gap = 24
): Shift {
    const none = { dx: 0, dy: 0 };
    if (group.length === 0 || !collides(group, others, none, gap)) return none;

    const left = minBy(group, (b) => b.x);
    const top = minBy(group, (b) => b.y);
    const right = maxBy(group, (b) => b.x + b.width);
    const bottom = maxBy(group, (b) => b.y + b.height);

    const options: Shift[] = [];
    for (const o of others) {
        options.push(
            { dx: o.x + o.width + gap - left, dy: 0 },
            { dx: o.x - gap - right, dy: 0 },
            { dx: 0, dy: o.y + o.height + gap - top },
            { dx: 0, dy: o.y - gap - bottom }
        );
    }
    const farRight = maxBy(others, (o) => o.x + o.width);
    const farLeft = minBy(others, (o) => o.x);
    const farDown = maxBy(others, (o) => o.y + o.height);
    const farUp = minBy(others, (o) => o.y);
    options.push(
        { dx: farRight + gap - left, dy: 0 },
        { dx: farLeft - gap - right, dy: 0 },
        { dx: 0, dy: farDown + gap - top },
        { dx: 0, dy: farUp - gap - bottom }
    );

    let best: Shift | undefined;
    let bestCost = Infinity;
    for (const s of options) {
        const cost = Math.abs(s.dx) + Math.abs(s.dy);
        if (cost >= bestCost) continue;
        if (collides(group, others, s, gap)) continue;
        best = s;
        bestCost = cost;
    }
    return best ?? none;
}
