import { describe, expect, it } from 'vitest';
import { apply } from '@/core/commands/apply';
import type { Design } from '@/core/model/design';
import { commitShapes } from './commit-shapes';
import { withMembersFollowing } from './region-follow';
import { shop, withRegion } from './test/fixtures';

/** The shop with an area around users and orders, which are its members; items is outside. */
function areaAroundTwo() {
    const s = shop();
    const placed = withRegion(s.design, {
        x: -100,
        y: -100,
        width: 800,
        height: 600,
    });
    let design: Design = placed.design;
    for (const id of [s.users, s.orders]) {
        const r = apply(
            design,
            {
                type: 'entity.update',
                id,
                patch: { regionId: placed.regionId },
            },
            { now: 0 }
        );
        if (!r.ok) throw new Error('no membership');
        design = r.design as Design;
    }
    return { s, design, region: placed.regionId };
}

describe('EDT-037 the tables of an area travel with it while it is dragged', () => {
    it('moves every member by the same step as the area, and nothing else', () => {
        const { s, design, region } = areaAroundTwo();
        const next = withMembersFollowing(
            design,
            region,
            {},
            { [region]: { x: 40, y: 60 } },
            new Set()
        );
        // the area went from (-100, -100) to (40, 60): a step of (140, 160)
        expect(next[s.users]).toEqual({ x: 140, y: 160 });
        expect(next[s.orders]).toEqual({ x: 440, y: 160 });
        expect(next[s.items]).toBeUndefined();
    });

    it('continues from the live position of the last batch', () => {
        const { s, design, region } = areaAroundTwo();
        const before = {
            [region]: { x: 40, y: 60 },
            [s.users]: { x: 140, y: 160 },
            [s.orders]: { x: 440, y: 160 },
        };
        const next = withMembersFollowing(
            design,
            region,
            before,
            { ...before, [region]: { x: 50, y: 60 } },
            new Set()
        );
        expect(next[s.users]).toEqual({ x: 150, y: 160 });
        expect(next[s.orders]).toEqual({ x: 450, y: 160 });
    });

    it('leaves alone a member that is moving by itself in the same batch', () => {
        const { s, design, region } = areaAroundTwo();
        const next = withMembersFollowing(
            design,
            region,
            {},
            { [region]: { x: 40, y: 60 }, [s.users]: { x: 140, y: 160 } },
            new Set([s.users])
        );
        expect(next[s.users]).toEqual({ x: 140, y: 160 });
        expect(next[s.orders]).toEqual({ x: 440, y: 160 });
    });

    it('does nothing when the area did not move', () => {
        const { design, region } = areaAroundTwo();
        const after = { [region]: { x: -100, y: -100 } };
        expect(withMembersFollowing(design, region, {}, after, new Set())).toBe(
            after
        );
    });

    it('ends in the same place the drop commits, so nothing jumps on release', () => {
        const { s, design, region } = areaAroundTwo();
        const live = withMembersFollowing(
            design,
            region,
            {},
            { [region]: { x: 40, y: 60 } },
            new Set()
        );
        const command = commitShapes(design, { positions: live, sizes: {} });
        const done = apply(design, command!, { now: 0 });
        if (!done.ok) throw new Error('no commit');
        const after = done.design as Design;
        expect([
            after.entities.byId[s.users].x,
            after.entities.byId[s.users].y,
        ]).toEqual([live[s.users].x, live[s.users].y]);
        expect(after.entities.byId[s.orders].x).toBe(live[s.orders].x);
        expect(after.regions.byId[region].box.x).toBe(40);
    });
});
