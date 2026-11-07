import { describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import { shop } from './test/fixtures';
import { renderCanvas } from './test/render';
import { buildEdges, buildNodes, NO_LIVE } from './flow-model';
import type { FlowInput, NodeMemory } from './flow-model';
import type { LinkEdge } from './flow-model';
import { HANDLES_MIN_ZOOM } from './field-row';

/** Behaviour that keeps a large diagram quick (the numbers are in rewrite/phase9/perf.md). */
function input(over: Partial<FlowInput> = {}): FlowInput {
    const s = shop();
    return {
        design: s.design,
        selection: new Set<string>(),
        visible: new Set([s.users, s.orders, s.items]),
        live: NO_LIVE,
        flashing: new Set<string>(),
        overlapping: new Set<string>(),
        sizes: { [s.users]: { width: 224, height: 112 } },
        outlineOverlaps: false,
        editable: true,
        ...over,
    };
}

describe('nodes and edges are kept between builds', () => {
    it('an unchanged input gives the very same node objects', () => {
        const memory: NodeMemory = new Map();
        const base = input();
        const first = buildNodes(base, memory);
        const second = buildNodes({ ...base }, memory);
        expect(second).toHaveLength(first.length);
        second.forEach((node, i) => expect(node).toBe(first[i]));
    });

    it('a drag changes the moved node only', () => {
        const memory: NodeMemory = new Map();
        const base = input();
        const [firstUsers, firstOrders, firstItems] = buildNodes(base, memory);
        const s = shop();
        const moved = buildNodes(
            {
                ...base,
                live: {
                    positions: { [s.users]: { x: 41, y: 42 } },
                    sizes: {},
                },
            },
            memory
        );
        const byId = (id: string) => moved.find((n) => n.id === id)!;
        const ids = [firstUsers, firstOrders, firstItems].map((n) => n.id);
        const users = ids.find((id) => id === s.users)!;
        expect(byId(users)).not.toBe(firstUsers);
        expect(byId(users).position).toEqual({ x: 41, y: 42 });
        expect(byId(firstOrders.id)).toBe(firstOrders);
        expect(byId(firstItems.id)).toBe(firstItems);
    });

    it('selection, a new measured size and the dimming are noticed', () => {
        const memory: NodeMemory = new Map();
        const s = shop();
        const base = input();
        const before = buildNodes(base, memory);
        const picked = buildNodes(
            { ...base, selection: new Set([s.users]) },
            memory
        );
        expect(picked.find((n) => n.id === s.users)!.selected).toBe(true);
        // the table that is neither picked nor linked stands back
        const items = picked.find((n) => n.id === s.items)!;
        expect((items.data as { dimmed: boolean }).dimmed).toBe(true);
        expect(items).not.toBe(before.find((n) => n.id === s.items));
        const measured = buildNodes(
            {
                ...base,
                selection: new Set([s.users]),
                sizes: { [s.orders]: { width: 224, height: 90 } },
            },
            memory
        );
        expect(measured.find((n) => n.id === s.orders)!.measured).toEqual({
            width: 224,
            height: 90,
        });
    });

    it('forgets tables that are gone', () => {
        const memory: NodeMemory = new Map();
        const s = shop();
        buildNodes(input(), memory);
        expect(memory.size).toBe(3);
        const again = buildNodes(
            input({ visible: new Set([s.users]) }),
            memory
        );
        expect(again).toHaveLength(1);
        expect(memory.size).toBe(1);
    });

    it('an edge is kept while its sides and selection stay, and replaced when they change', () => {
        const kept = new Map<string, LinkEdge>();
        const sides = new Map();
        const s = shop();
        const base = input();
        const first = buildEdges(base, sides, kept);
        expect(first).toHaveLength(1);
        const same = buildEdges({ ...base }, sides, kept);
        expect(same[0]).toBe(first[0]);
        const selected = buildEdges(
            { ...base, selection: new Set([s.link]) },
            sides,
            kept
        );
        expect(selected[0]).not.toBe(first[0]);
        expect(selected[0].selected).toBe(true);
        // a link whose table is hidden leaves the memory
        buildEdges({ ...base, visible: new Set([s.users]) }, sides, kept);
        expect(kept.size).toBe(0);
    });
});

describe('connection dots on a zoomed-out diagram', () => {
    const dots = (id: string) =>
        screen
            .getByTestId(`entity-${id}`)
            .querySelectorAll('.react-flow__handle').length;

    it('every field has its two dots when zoomed in', () => {
        const s = shop();
        renderCanvas(s.design);
        expect(dots(s.orders)).toBe(4);
        expect(dots(s.users)).toBe(2);
    });

    it('below the threshold only a field a line ends on keeps its dots', () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        act(() => store.getState().setZoom(HANDLES_MIN_ZOOM - 0.1));
        // orders has two fields, one of them carries the link
        expect(dots(s.orders)).toBe(2);
        expect(dots(s.users)).toBe(2);
        expect(dots(s.items)).toBe(0);
        act(() => store.getState().setZoom(1));
        expect(dots(s.items)).toBe(2);
        expect(dots(s.orders)).toBe(4);
    });
});
