import { describe, expect, it, vi } from 'vitest';
import type { Design } from '@/core/model/design';
import type { Entity } from '@/core/model/entity';
import { createEditorStore } from '@/store/editor-store';
import { moveToArea } from './canvas-actions';
import type { MenuDeps } from './menu-actions';
import { moveToNewArea, runMenuAction } from './menu-actions';
import { shop, withRegion } from './test/fixtures';

const measure = (entity: Entity) => ({
    width: entity.width ?? 200,
    height: 100,
});

const setup = (design: Design = shop().design) => {
    const store = createEditorStore({ design });
    const deps: MenuDeps = {
        store,
        measure,
        drawn: new Set(design.entities.order),
        openLinkDialog: vi.fn(),
        startEditing: vi.fn(),
        startRename: vi.fn(),
        beginLink: vi.fn(),
        askArrange: vi.fn(),
    };
    const design0 = () => store.getState().design;
    return { store, deps, design: design0 };
};

describe('runMenuAction: lines that hand over to the canvas', () => {
    it('Add Relationship opens the link dialog, and does nothing when there is none', () => {
        const { deps } = setup();
        runMenuAction({ type: 'new-link-dialog' }, deps);
        expect(deps.openLinkDialog).toHaveBeenCalledTimes(1);
        // the dialog is optional on a surface that has none
        expect(() =>
            runMenuAction(
                { type: 'new-link-dialog' },
                { ...deps, openLinkDialog: undefined }
            )
        ).not.toThrow();
    });

    it('Auto Arrange asks first instead of moving anything', () => {
        const { deps, design } = setup();
        const before = design();
        runMenuAction({ type: 'arrange-all' }, deps);
        expect(deps.askArrange).toHaveBeenCalledTimes(1);
        expect(design()).toBe(before);
    });

    it('Edit, Draw Relationship and Rename call the canvas with the id', () => {
        const s = shop();
        const { deps } = setup(s.design);
        runMenuAction({ type: 'edit-entity', id: s.users }, deps);
        runMenuAction({ type: 'draw-link', id: s.orders }, deps);
        runMenuAction({ type: 'rename-region', id: 'r1' }, deps);
        expect(deps.startEditing).toHaveBeenCalledWith(s.users);
        expect(deps.beginLink).toHaveBeenCalledWith(s.orders);
        expect(deps.startRename).toHaveBeenCalledWith('r1');
    });
});

describe('runMenuAction: lines that edit the design', () => {
    it('New Table adds a table at the point, selects it and opens its form', () => {
        const { deps, design, store } = setup();
        const count = design().entities.order.length;
        runMenuAction(
            { type: 'new-entity', kind: 'table', at: { x: 2000.4, y: 1500.6 } },
            deps
        );
        expect(design().entities.order).toHaveLength(count + 1);
        const id = design().entities.order.at(-1)!;
        expect(design().entities.byId[id].kind).toBe('table');
        expect(store.getState().ui.selection).toEqual([id]);
        expect(deps.startEditing).toHaveBeenCalledWith(id);
    });

    it('New View adds a view', () => {
        const { deps, design } = setup();
        runMenuAction(
            { type: 'new-entity', kind: 'view', at: { x: 3000, y: 3000 } },
            deps
        );
        const id = design().entities.order.at(-1)!;
        expect(design().entities.byId[id].kind).toBe('view');
    });

    it('New Table on a read-only diagram adds nothing and opens no form', () => {
        const store = createEditorStore({
            design: shop().design,
            readonly: true,
        });
        const { deps } = setup();
        const before = store.getState().design;
        runMenuAction(
            { type: 'new-entity', kind: 'table', at: { x: 0, y: 0 } },
            { ...deps, store }
        );
        expect(store.getState().design).toBe(before);
        expect(deps.startEditing).not.toHaveBeenCalled();
    });

    it('New Area and New Note add one each, each one undo step', () => {
        const { deps, design, store } = setup();
        runMenuAction({ type: 'new-region', at: { x: 10, y: 10 } }, deps);
        expect(design().regions.order).toHaveLength(1);
        const s = shop();
        runMenuAction(
            { type: 'new-note', anchor: { kind: 'entity', id: s.users } },
            deps
        );
        expect(design().memos.order).toHaveLength(1);
        store.getState().undo();
        expect(design().memos.order).toHaveLength(0);
        store.getState().undo();
        expect(design().regions.order).toHaveLength(0);
    });

    it('Duplicate makes a copy of the table', () => {
        const s = shop();
        const { deps, design } = setup(s.design);
        runMenuAction({ type: 'duplicate-entity', id: s.items }, deps);
        expect(design().entities.order).toHaveLength(4);
    });

    it('Delete removes the given tables, whatever was selected, and clears the selection', () => {
        const s = shop();
        const { deps, design, store } = setup(s.design);
        store.getState().select([s.users]);
        runMenuAction(
            { type: 'delete-entities', ids: [s.items, s.orders] },
            deps
        );
        expect(design().entities.order).toEqual([s.users]);
        expect(store.getState().ui.selection).toEqual([]);
    });

    it('Move to Area puts the tables in the area', () => {
        const s = shop();
        const placed = withRegion(s.design, {
            x: 0,
            y: 600,
            width: 800,
            height: 600,
        });
        const { deps, design } = setup(placed.design);
        runMenuAction(
            {
                type: 'move-to-area',
                ids: [s.users, s.items],
                regionId: placed.regionId,
            },
            deps
        );
        expect(design().entities.byId[s.users].regionId).toBe(placed.regionId);
        expect(design().entities.byId[s.items].regionId).toBe(placed.regionId);
        expect(design().entities.byId[s.orders].regionId).toBeUndefined();
    });

    it('Delete Area removes the area', () => {
        const placed = withRegion(shop().design, {
            x: 0,
            y: 600,
            width: 400,
            height: 300,
        });
        const { deps, design } = setup(placed.design);
        runMenuAction({ type: 'delete-region', id: placed.regionId }, deps);
        expect(design().regions.byId[placed.regionId]).toBeUndefined();
    });

    it('Auto Arrange in an area moves only the drawn tables of that area', () => {
        const s = shop();
        const placed = withRegion(s.design, {
            x: 0,
            y: 600,
            width: 1200,
            height: 800,
        });
        const { deps, design, store } = setup(placed.design);
        moveToArea(store, [s.users, s.orders], placed.regionId, measure);
        const at = (id: string) => {
            const e = design().entities.byId[id];
            return { x: e.x, y: e.y };
        };
        const items = at(s.items);
        const orders = at(s.orders);
        runMenuAction(
            { type: 'arrange-region', id: placed.regionId },
            // orders is hidden by a filter: it must stay where it is
            { ...deps, drawn: new Set([s.users, s.items]) }
        );
        expect(at(s.items)).toEqual(items);
        expect(at(s.orders)).toEqual(orders);
    });
});

describe('moveToNewArea', () => {
    it('makes an area at the rounded point and moves the tables into it, as one undo step', () => {
        const s = shop();
        const store = createEditorStore({ design: s.design });
        expect(
            moveToNewArea(store, [s.users], { x: 100.6, y: 49.4 }, measure)
        ).toBe(true);
        const design = store.getState().design;
        expect(design.regions.order).toHaveLength(1);
        const region = design.regions.byId[design.regions.order[0]];
        expect(region.box.x).toBe(101);
        expect(region.box.y).toBe(49);
        expect(design.entities.byId[s.users].regionId).toBe(region.id);
        store.getState().undo();
        expect(store.getState().design.regions.order).toHaveLength(0);
        expect(
            store.getState().design.entities.byId[s.users].regionId
        ).toBeUndefined();
    });

    it('still makes the empty area when none of the ids is a table', () => {
        const store = createEditorStore({ design: shop().design });
        expect(
            moveToNewArea(store, ['no-such-table'], { x: 0, y: 0 }, measure)
        ).toBe(true);
        expect(store.getState().design.regions.order).toHaveLength(1);
    });

    it('runs from the menu line too', () => {
        const s = shop();
        const { deps, design } = setup(s.design);
        runMenuAction(
            { type: 'move-to-new-area', ids: [s.items], at: { x: 0, y: 900 } },
            deps
        );
        expect(design().regions.order).toHaveLength(1);
        expect(design().entities.byId[s.items].regionId).toBe(
            design().regions.order[0]
        );
    });

    it('reports failure and changes nothing on a read-only diagram', () => {
        const s = shop();
        const store = createEditorStore({ design: s.design, readonly: true });
        expect(moveToNewArea(store, [s.users], { x: 0, y: 0 }, measure)).toBe(
            false
        );
        expect(store.getState().design.regions.order).toHaveLength(0);
    });
});
