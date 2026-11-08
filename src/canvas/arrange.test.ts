import { describe, expect, it } from 'vitest';
import { createEditorStore } from '@/store/editor-store';
import { entityList } from '@/core/model/lookup';
import { planAddEntity } from '@/core/commands/plan-entity';
import { arrangeDiagram, moveToArea } from './canvas-actions';
import { layoutTiles, planArrange, planMoveToArea } from './auto-arrange';
import { intersects, overlappingIds } from './geometry';
import { shop, withRegion } from './test/fixtures';
import { sizeFor } from './geometry';

const measure = (e: Parameters<typeof sizeFor>[0]) => sizeFor(e, {});
const box = (id: string, x: number, y: number) => ({
    id,
    box: { x, y, width: 224, height: 80 },
});

describe('auto arrange', () => {
    it('EDT-051: related tables end up near each other and unrelated ones form a grid beside them', () => {
        const tile = (id: string) => ({ id, width: 224, height: 80 });
        const layout = layoutTiles(
            ['a', 'b', 'c', 'x', 'y', 'z', 'w'].map(tile),
            [
                ['a', 'b'],
                ['b', 'c'],
            ]
        );
        const at = (id: string) => layout.positions.get(id)!;
        const related = ['a', 'b', 'c'].map(at);
        const loose = ['x', 'y', 'z', 'w'].map(at);
        const relatedRight = Math.max(...related.map((p) => p.x)) + 224;
        expect(Math.min(...loose.map((p) => p.x))).toBeGreaterThanOrEqual(
            relatedRight
        );
        // the loose ones form a 2 x 2 grid
        expect(new Set(loose.map((p) => p.x)).size).toBe(2);
        expect(new Set(loose.map((p) => p.y)).size).toBe(2);
        // nothing overlaps
        const boxes = [...layout.positions].map(([id, p]) => ({
            id,
            box: { ...p, width: 224, height: 80 },
        }));
        expect(overlappingIds(boxes).size).toBe(0);
    });

    it('EDT-051: tables joined by a link sit in the same or neighbouring columns; far ends of a chain are further apart', () => {
        const tile = (id: string) => ({ id, width: 224, height: 80 });
        const layout = layoutTiles(['a', 'b', 'c', 'd', 'e'].map(tile), [
            ['a', 'b'],
            ['b', 'c'],
            ['c', 'd'],
            ['d', 'e'],
        ]);
        const x = (id: string) => layout.positions.get(id)!.x;
        const column = 224 + 80;
        for (const [p, q] of [
            ['a', 'b'],
            ['b', 'c'],
            ['c', 'd'],
            ['d', 'e'],
        ])
            expect(Math.abs(x(p) - x(q))).toBeLessThanOrEqual(column);
        expect(Math.abs(x('a') - x('e'))).toBeGreaterThan(column);
    });

    it('EDT-052: the whole arrangement is one undo step and tables the filter hides stay put', () => {
        const s = shop();
        const store = createEditorStore({ design: s.design });
        const before = { ...s.design.entities.byId[s.items] };
        expect(
            arrangeDiagram(
                store,
                { ids: new Set([s.users, s.orders]) },
                measure
            )
        ).toBe(true);
        const after = store.getState().design.entities.byId;
        expect([after[s.items].x, after[s.items].y]).toEqual([
            before.x,
            before.y,
        ]);
        expect(store.getState().history.undo).toHaveLength(1);
        store.getState().undo();
        expect(store.getState().design.entities.byId[s.orders].x).toBe(300);
    });

    it('EDT-052: tables inside an area stay grouped with it', () => {
        const s = shop();
        const placed = withRegion(s.design, {
            x: 2000,
            y: 2000,
            width: 300,
            height: 200,
        });
        const store = createEditorStore({ design: placed.design });
        store.getState().edit({
            type: 'entity.update',
            id: s.items,
            patch: { regionId: placed.regionId },
        });
        const all = new Set(placed.design.entities.order);
        arrangeDiagram(store, { ids: all }, measure);
        const state = store.getState().design;
        const region = state.regions.byId[placed.regionId];
        const items = state.entities.byId[s.items];
        expect(items.x).toBeGreaterThanOrEqual(region.box.x);
        expect(items.y).toBeGreaterThanOrEqual(region.box.y);
        expect(items.x + 224).toBeLessThanOrEqual(
            region.box.x + region.box.width
        );
        expect(items.regionId).toBe(placed.regionId);
        // the loose tables are not inside it
        expect(state.entities.byId[s.users].regionId).toBeUndefined();
    });

    it('EDT-053: arranging one area lays out only its tables and grows it when they do not fit', () => {
        const s = shop();
        const placed = withRegion(s.design, {
            x: 0,
            y: 0,
            width: 300,
            height: 120,
        });
        const store = createEditorStore({ design: placed.design });
        store.getState().edit({
            type: 'group',
            commands: [s.users, s.orders].map((id) => ({
                type: 'entity.update' as const,
                id,
                patch: { regionId: placed.regionId },
            })),
        });
        const itemsBefore = {
            ...store.getState().design.entities.byId[s.items],
        };
        arrangeDiagram(
            store,
            { ids: new Set([s.users, s.orders]), regionId: placed.regionId },
            measure
        );
        const state = store.getState().design;
        const region = state.regions.byId[placed.regionId];
        expect(region.box.x).toBe(0);
        expect(region.box.width).toBeGreaterThan(300);
        expect(region.box.height).toBeGreaterThan(120);
        const items = state.entities.byId[s.items];
        expect([items.x, items.y]).toEqual([itemsBefore.x, itemsBefore.y]);
        for (const id of [s.users, s.orders]) {
            const e = state.entities.byId[id];
            expect(e.x + 224).toBeLessThanOrEqual(
                region.box.x + region.box.width
            );
        }
    });

    it('EDT-052: nothing is sent for a diagram with no tables to arrange', () => {
        const s = shop();
        expect(
            planArrange(s.design, { ids: new Set() }, measure)
        ).toBeUndefined();
    });
});

describe('move to area', () => {
    it('EDT-204: tables go into a tidy grid inside the area, which grows if needed', () => {
        const s = shop();
        const placed = withRegion(s.design, {
            x: 1000,
            y: 1000,
            width: 260,
            height: 120,
        });
        const store = createEditorStore({ design: placed.design });
        moveToArea(
            store,
            [s.users, s.orders, s.items],
            placed.regionId,
            measure
        );
        const state = store.getState().design;
        const region = state.regions.byId[placed.regionId];
        const boxes = [s.users, s.orders, s.items].map((id) => {
            const e = state.entities.byId[id];
            return { id, box: { x: e.x, y: e.y, ...measure(e) } };
        });
        expect(overlappingIds(boxes).size).toBe(0);
        for (const { box: b } of boxes) {
            expect(b.x).toBeGreaterThanOrEqual(region.box.x);
            expect(b.x + b.width).toBeLessThanOrEqual(
                region.box.x + region.box.width
            );
            expect(b.y + b.height).toBeLessThanOrEqual(
                region.box.y + region.box.height
            );
        }
        for (const id of [s.users, s.orders, s.items])
            expect(state.entities.byId[id].regionId).toBe(placed.regionId);
        expect(store.getState().history.undo).toHaveLength(1);
    });

    it('EDT-204: tables already in the area are not covered', () => {
        const s = shop();
        const placed = withRegion(s.design, {
            x: 1000,
            y: 1000,
            width: 600,
            height: 300,
        });
        const store = createEditorStore({ design: placed.design });
        moveToArea(store, [s.users], placed.regionId, measure);
        moveToArea(store, [s.orders], placed.regionId, measure);
        const state = store.getState().design;
        const a = state.entities.byId[s.users];
        const b = state.entities.byId[s.orders];
        expect(
            intersects(
                { x: a.x, y: a.y, ...measure(a) },
                { x: b.x, y: b.y, ...measure(b) }
            )
        ).toBe(false);
    });

    it('EDT-205: No Area moves a table to just outside the rectangle', () => {
        const s = shop();
        const placed = withRegion(s.design, {
            x: 1000,
            y: 1000,
            width: 600,
            height: 300,
        });
        const store = createEditorStore({ design: placed.design });
        moveToArea(store, [s.users], placed.regionId, measure);
        expect(store.getState().design.entities.byId[s.users].regionId).toBe(
            placed.regionId
        );
        moveToArea(store, [s.users], undefined, measure);
        const e = store.getState().design.entities.byId[s.users];
        expect(e.regionId).toBeUndefined();
        expect(e.x).toBeGreaterThanOrEqual(1600);
        expect(
            planMoveToArea(
                store.getState().design,
                [s.users],
                undefined,
                measure
            )
        ).toBeUndefined();
    });

    it('EDT-058: the move applies to every table given', () => {
        const s = shop();
        const placed = withRegion(s.design, {
            x: 1000,
            y: 1000,
            width: 900,
            height: 300,
        });
        const store = createEditorStore({ design: placed.design });
        moveToArea(store, [s.users, s.orders], placed.regionId, measure);
        const state = store.getState().design;
        expect(
            entityList(state).filter((e) => e.regionId === placed.regionId)
        ).toHaveLength(2);
    });
});

describe('overlap', () => {
    it('EDT-038: tables whose boxes overlap are found', () => {
        const hit = overlappingIds([
            box('a', 0, 0),
            box('b', 100, 20),
            box('c', 600, 0),
        ]);
        expect([...hit].sort()).toEqual(['a', 'b']);
        expect(overlappingIds([box('a', 0, 0), box('c', 600, 0)]).size).toBe(0);
        // touching edges are not an overlap
        expect(overlappingIds([box('a', 0, 0), box('b', 224, 0)]).size).toBe(0);
    });

    it('EDT-052: new tables from planAddEntity are arranged like any other', () => {
        const s = shop();
        const store = createEditorStore({ design: s.design });
        store.getState().edit(planAddEntity(s.design, { x: 5, y: 5 }));
        expect(
            arrangeDiagram(
                store,
                { ids: new Set(store.getState().design.entities.order) },
                measure
            )
        ).toBe(true);
    });
});
