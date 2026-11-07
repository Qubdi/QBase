import { describe, expect, it, vi } from 'vitest';
import { createEditorStore } from '@/store/editor-store';
import {
    addEntityAt,
    duplicateEntity,
    pasteClipboard,
    copySelection,
} from './canvas-actions';
import { dropNewItem } from './drop-items';
import { chooseSides, SIDE_MARGIN } from './flow-model';
import { intersects, sizeFor } from './geometry';
import { forgetClipboard } from './clipboard';
import { findFreeShift } from './placement';
import { shop } from './test/fixtures';
import { renderCanvas } from './test/render';

const box = (x: number, y: number, width = 224, height = 80) => ({
    x,
    y,
    width,
    height,
});
const measure = (e: Parameters<typeof sizeFor>[0]) => sizeFor(e, {});

const overlapsAny = (
    store: ReturnType<typeof createEditorStore>,
    id: string
) => {
    const d = store.getState().design;
    const e = d.entities.byId[id];
    const mine = { x: e.x, y: e.y, ...measure(e) };
    return d.entities.order
        .filter((o) => o !== id)
        .some((o) => {
            const other = d.entities.byId[o];
            return intersects(mine, {
                x: other.x,
                y: other.y,
                ...measure(other),
            });
        });
};

describe('collision-free placement', () => {
    it('EDT-038: nothing moves when the group already clears the others', () => {
        expect(findFreeShift([box(0, 0)], [box(400, 0)], 24)).toEqual({
            dx: 0,
            dy: 0,
        });
        expect(findFreeShift([box(0, 0)], [], 24)).toEqual({ dx: 0, dy: 0 });
    });

    it('EDT-038: an overlapping table takes the shortest straight move that keeps the gap', () => {
        // overlaps by 4 px on the right: moving left (or right) 4+gap+... is not shorter than moving up
        const shift = findFreeShift([box(0, 0)], [box(100, 60, 224, 80)], 24);
        expect(shift.dx === 0 || shift.dy === 0).toBe(true);
        const moved = box(shift.dx, shift.dy);
        expect(
            moved.y + moved.height + 24 <= 60 ||
                moved.y >= 60 + 80 + 24 ||
                moved.x + moved.width + 24 <= 100 ||
                moved.x >= 100 + 224 + 24
        ).toBe(true);
        // the cheapest escape here is upwards: 0..80 must end above 60 - 24
        expect(shift).toEqual({ dx: 0, dy: 60 - 24 - 80 });
    });

    it('EDT-232: a group moves as one piece and avoids every neighbour', () => {
        const group = [box(0, 0), box(300, 0)];
        const others = [box(100, 0), box(700, 0)];
        const { dx, dy } = findFreeShift(group, others, 24);
        for (const g of group)
            for (const o of others)
                expect(intersects({ ...g, x: g.x + dx, y: g.y + dy }, o)).toBe(
                    false
                );
        expect(dx === 0 || dy === 0).toBe(true);
    });

    it('EDT-038: walled in on all sides it still finds a way out', () => {
        const wall = [
            box(-300, -100),
            box(300, -100),
            box(0, -200),
            box(0, 100),
            box(0, 0, 1, 1),
        ];
        const { dx, dy } = findFreeShift([box(0, 0)], wall, 24);
        for (const o of wall) expect(intersects(box(dx, dy), o)).toBe(false);
    });

    it('EDT-055: a table created at the pointer on top of others slides clear', () => {
        const s = shop();
        const store = createEditorStore({ design: s.design });
        const id = addEntityAt(store, 'table', { x: 310, y: 10 })!;
        expect(overlapsAny(store, id)).toBe(false);
        const free = addEntityAt(store, 'table', { x: 2000, y: 2000 })!;
        const e = store.getState().design.entities.byId[free];
        expect([e.x, e.y]).toEqual([2000, 2000]);
    });

    it('EDT-099: a duplicate clear of its neighbours', () => {
        const s = shop();
        const store = createEditorStore({ design: s.design });
        const id = duplicateEntity(store, s.orders)!;
        expect(overlapsAny(store, id)).toBe(false);
    });

    it('EDT-232: a paste never lands on a table', () => {
        const s = shop();
        const store = createEditorStore({ design: s.design });
        forgetClipboard();
        store.getState().select([s.users, s.orders]);
        copySelection(store);
        pasteClipboard(store);
        pasteClipboard(store);
        const d = store.getState().design;
        for (const id of d.entities.order.slice(3))
            expect(overlapsAny(store, id)).toBe(false);
    });

    it('a table dropped from outside lands clear of others', () => {
        const s = shop();
        const store = createEditorStore({ design: s.design });
        dropNewItem(store, 'table', { x: 600, y: 0 });
        const d = store.getState().design;
        expect(overlapsAny(store, d.entities.order.at(-1)!)).toBe(false);
    });
});

describe('sides keep still while a table wobbles', () => {
    const at = (x: number) => ({ x, width: 224 });

    it('EDT-171: with nothing before, the facing edges are chosen', () => {
        expect(chooseSides(at(0), at(300), false)).toEqual(['r', 'l']);
        expect(chooseSides(at(300), at(0), false)).toEqual(['l', 'r']);
        expect(chooseSides(at(0), at(100), false)).toEqual(['r', 'r']);
    });

    it('EDT-171: a line keeps its sides while the tables are only a little past facing', () => {
        const before: ['r', 'l'] = ['r', 'l'];
        // target now overlaps the source by less than the margin
        expect(
            chooseSides(at(0), at(224 - (SIDE_MARGIN - 8)), false, before)
        ).toEqual(['r', 'l']);
        // far past it: the sides change
        expect(
            chooseSides(at(0), at(224 - SIDE_MARGIN - 40), false, before)
        ).not.toEqual(['r', 'l']);
        // the same wobble without memory would already flip
        expect(chooseSides(at(0), at(224 - (SIDE_MARGIN - 8)), false)).toEqual([
            'r',
            'r',
        ]);
    });

    it('EDT-171: it is deterministic: the same history gives the same sides', () => {
        const run = () => {
            let sides = chooseSides(at(0), at(300), false);
            for (const x of [260, 230, 190, 230, 300, 120, 0])
                sides = chooseSides(at(0), at(x), false, sides);
            return sides;
        };
        expect(run()).toEqual(run());
    });

    it('EDT-172: a self link stays on the right', () => {
        expect(chooseSides(at(0), at(0), true, ['l', 'l'])).toEqual(['r', 'r']);
    });
});

describe('handing the camera to the frame', () => {
    it('EDT-022: onReady is called once with fit, zoomToIds and viewportOrigin', () => {
        const onReady = vi.fn();
        const { rerender } = renderCanvas(shop().design, {
            canvas: { onReady },
        });
        expect(onReady).toHaveBeenCalledTimes(1);
        const controls = onReady.mock.calls[0][0];
        expect(typeof controls.fit).toBe('function');
        expect(typeof controls.zoomToIds).toBe('function');
        expect(controls.viewportOrigin()).toEqual({ x: -0, y: -0 });
        expect(() => controls.fit()).not.toThrow();
        expect(() => controls.zoomToIds([])).not.toThrow();
        void rerender;
        expect(onReady).toHaveBeenCalledTimes(1);
    });
});
