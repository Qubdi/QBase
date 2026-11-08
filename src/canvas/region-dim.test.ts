import { describe, expect, it } from 'vitest';
import { apply } from '@/core/commands/apply';
import { createRegion } from '@/core/model/defaults';
import type { Design } from '@/core/model/design';
import type { Id } from '@/core/model/id';
import { buildNodes, dimmedRegions, NO_LIVE } from './flow-model';
import { shop } from './test/fixtures';

/** Adds an area to the design (each one gets its own id) and returns both. */
function withRegion(
    design: Design,
    box: { x: number; y: number; width: number; height: number }
): { design: Design; regionId: Id } {
    const region = createRegion(design, { label: 'Area', box });
    const added = apply(
        design,
        { type: 'item.insert', collection: 'regions', item: region },
        { now: 0 }
    );
    if (!added.ok) throw new Error('no area');
    return { design: added.design as Design, regionId: region.id };
}

/**
 * The shop: users and orders are linked, items has no link. Four areas: one
 * around users, one around orders, one around items, and one with no table.
 */
function withAreas() {
    const s = shop();
    let design: Design = s.design;
    const area = (x: number, members: Id[]) => {
        const placed = withRegion(design, {
            x,
            y: -100,
            width: 250,
            height: 400,
        });
        design = placed.design;
        for (const id of members) {
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
        return placed.regionId;
    };
    const ofUsers = area(-2000, [s.users]);
    const ofOrders = area(-1600, [s.orders]);
    const ofItems = area(-1200, [s.items]);
    const empty = area(-800, []);
    return { s, design, ofUsers, ofOrders, ofItems, empty };
}

describe('EDT-032 an area stands back with its tables', () => {
    it('is not dimmed when nothing is selected', () => {
        const { design } = withAreas();
        expect(dimmedRegions(design, new Set()).size).toBe(0);
    });

    it('stays bright when one of its tables is selected or linked to the selection', () => {
        const { s, design, ofUsers, ofOrders } = withAreas();
        const dim = dimmedRegions(design, new Set([s.users]));
        expect(dim.has(ofUsers)).toBe(false);
        expect(dim.has(ofOrders)).toBe(false);
    });

    it('fades when none of its tables is selected or linked, and when it has no tables', () => {
        const { s, design, ofItems, empty } = withAreas();
        const dim = dimmedRegions(design, new Set([s.users]));
        expect(dim.has(ofItems)).toBe(true);
        expect(dim.has(empty)).toBe(true);
    });

    it('stays bright when only one of several tables in it is connected', () => {
        const { s, design } = withAreas();
        const mixed = withRegion(design, {
            x: 0,
            y: 2000,
            width: 800,
            height: 400,
        });
        let next: Design = mixed.design;
        for (const id of [s.orders, s.items]) {
            const r = apply(
                next,
                {
                    type: 'entity.update',
                    id,
                    patch: { regionId: mixed.regionId },
                },
                { now: 0 }
            );
            if (!r.ok) throw new Error('no membership');
            next = r.design as Design;
        }
        // items is unrelated to users, but orders in the same area is linked
        expect(
            dimmedRegions(next, new Set([s.users])).has(mixed.regionId)
        ).toBe(false);
    });

    it('does not fade anything when an area, not a table, is selected', () => {
        const { design, ofItems } = withAreas();
        expect(dimmedRegions(design, new Set([ofItems])).size).toBe(0);
    });

    it('reaches the area nodes the canvas draws', () => {
        const { s, design, ofUsers, ofItems } = withAreas();
        const nodes = buildNodes({
            design,
            selection: new Set([s.users]),
            visible: new Set(design.entities.order),
            live: NO_LIVE,
            flashing: new Set<string>(),
            overlapping: new Set<string>(),
            sizes: {},
            outlineOverlaps: false,
            editable: true,
        });
        const dimmed = (id: Id) =>
            (nodes.find((n) => n.id === id)?.data as { dimmed?: boolean })
                .dimmed;
        expect(dimmed(ofUsers)).toBe(false);
        expect(dimmed(ofItems)).toBe(true);
    });
});
