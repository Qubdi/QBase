import { describe, expect, it } from 'vitest';
import { commitShapes } from './commit-shapes';
import { snapTo } from './geometry';
import { shop, withRegion } from './test/fixtures';
import { createEditorStore } from '@/store/editor-store';
import { planMove } from '@/core/commands/plan-visual';

describe('moving and snapping', () => {
    it('EDT-034: a finished drag sends one move; nothing is sent for no change', () => {
        const { design, users } = shop();
        expect(
            commitShapes(design, {
                positions: { [users]: { x: 0, y: 0 } },
                sizes: {},
            })
        ).toBeUndefined();
        const store = createEditorStore({ design });
        const command = commitShapes(design, {
            positions: { [users]: { x: 40, y: 60 } },
            sizes: {},
        });
        expect(command).toBeDefined();
        store.getState().edit(command!);
        const moved = store.getState().design.entities.byId[users];
        expect([moved.x, moved.y]).toEqual([40, 60]);
        expect(store.getState().history.undo).toHaveLength(1);
    });

    it('EDT-030, EDT-224: dragging several selected tables moves them all in one undo step', () => {
        const { design, users, orders } = shop();
        const store = createEditorStore({ design });
        const command = commitShapes(design, {
            positions: {
                [users]: { x: 10, y: 10 },
                [orders]: { x: 310, y: 10 },
            },
            sizes: {},
        });
        store.getState().edit(command!);
        expect(store.getState().design.entities.byId[orders].x).toBe(310);
        expect(store.getState().history.undo).toHaveLength(1);
        store.getState().undo();
        expect(store.getState().design.entities.byId[users].x).toBe(0);
        expect(store.getState().design.entities.byId[orders].x).toBe(300);
    });

    it('EDT-035: positions snap to the 20 px grid', () => {
        expect(snapTo(29)).toBe(20);
        expect(snapTo(31)).toBe(40);
        expect(snapTo(-9)).toBe(-0);
        expect(snapTo(-11)).toBe(-20);
    });

    it('EDT-036: dropping a table fully inside an area makes it a member; moving out removes it', () => {
        const { design, users } = shop();
        const placed = withRegion(design, {
            x: 1000,
            y: 1000,
            width: 500,
            height: 600,
        });
        const store = createEditorStore({ design: placed.design });
        store.getState().edit(
            commitShapes(placed.design, {
                positions: { [users]: { x: 1020, y: 1020 } },
                sizes: {},
            })!
        );
        expect(store.getState().design.entities.byId[users].regionId).toBe(
            placed.regionId
        );
        store.getState().edit(
            commitShapes(store.getState().design, {
                positions: { [users]: { x: 0, y: 0 } },
                sizes: {},
            })!
        );
        expect(
            store.getState().design.entities.byId[users].regionId
        ).toBeUndefined();
    });

    it('EDT-037: dragging an area takes its member tables along as one history step', () => {
        const { design, users } = shop();
        const placed = withRegion(design, {
            x: -50,
            y: -50,
            width: 400,
            height: 400,
        });
        const store = createEditorStore({ design: placed.design });
        // first make the membership real
        store
            .getState()
            .edit(planMove(placed.design, [{ id: users, x: 0, y: 0 }]));
        store.getState().resetHistory();
        expect(store.getState().design.entities.byId[users].regionId).toBe(
            placed.regionId
        );
        const command = commitShapes(store.getState().design, {
            positions: { [placed.regionId]: { x: 150, y: 250 } },
            sizes: {},
        });
        store.getState().edit(command!);
        const state = store.getState().design;
        expect(state.regions.byId[placed.regionId].box.x).toBe(150);
        expect([
            state.entities.byId[users].x,
            state.entities.byId[users].y,
        ]).toEqual([200, 300]);
        expect(store.getState().history.undo).toHaveLength(1);
    });

    it('EDT-203: resizing an area recomputes which tables are inside', () => {
        const { design, users } = shop();
        const placed = withRegion(design, {
            x: -10,
            y: -10,
            width: 100,
            height: 100,
        });
        expect(design.entities.byId[users].regionId).toBeUndefined();
        const store = createEditorStore({ design: placed.design });
        const command = commitShapes(placed.design, {
            positions: {},
            sizes: { [placed.regionId]: { width: 600, height: 400 } },
        });
        store.getState().edit(command!);
        expect(store.getState().design.entities.byId[users].regionId).toBe(
            placed.regionId
        );
    });
});
