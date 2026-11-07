import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { createEditorStore } from '@/store/editor-store';
import { addMemoAt, addRegionAt, deleteSelection } from './canvas-actions';
import { asHex, memoPale, regionFill } from './tints';
import { shop, withMemo, withRegion } from './test/fixtures';
import { renderCanvas } from './test/render';

describe('areas', () => {
    it('EDT-200: a new area is Area N, 300 x 200, with a palette colour, at the given point', () => {
        const { design } = shop();
        const store = createEditorStore({ design });
        const id = addRegionAt(store, { x: 120.4, y: 80.6 })!;
        const region = store.getState().design.regions.byId[id];
        expect(region.label).toBe('Area 1');
        expect(region.box).toEqual({ x: 120, y: 81, width: 300, height: 200 });
        expect(region.tint).toMatch(/^#[0-9a-f]{6}$/);
        expect(store.getState().ui.selection).toEqual([id]);
        const second = addRegionAt(store, { x: 0, y: 0 })!;
        expect(store.getState().design.regions.byId[second].label).toBe(
            'Area 2'
        );
    });

    it('EDT-201: an area is a tinted rectangle with a border and a name strip', () => {
        const placed = withRegion(
            shop().design,
            { x: 0, y: 0, width: 300, height: 200 },
            'Billing'
        );
        renderCanvas(placed.design);
        const area = screen.getByTestId(`region-${placed.regionId}`);
        expect(within(area).getByText('Billing')).toBeInTheDocument();
        expect(area.style.borderColor).not.toBe('');
        expect(regionFill('#336699')).toContain('#336699 15%');
    });

    it('EDT-201: a selected area can be resized; one that is not cannot', () => {
        const placed = withRegion(shop().design, {
            x: 0,
            y: 0,
            width: 300,
            height: 200,
        });
        const { store } = renderCanvas(placed.design);
        const grips = () =>
            screen
                .getByTestId(`region-${placed.regionId}`)
                .querySelectorAll('.react-flow__resize-control');
        expect(grips()).toHaveLength(0);
        act(() => store.getState().select([placed.regionId]));
        expect(grips().length).toBeGreaterThan(0);
    });

    it('EDT-206: a double click renames; Enter saves', () => {
        const placed = withRegion(
            shop().design,
            { x: 0, y: 0, width: 300, height: 200 },
            'Old'
        );
        const { store } = renderCanvas(placed.design);
        fireEvent.doubleClick(screen.getByText('Old'));
        const box = screen.getByLabelText('Area name');
        fireEvent.change(box, { target: { value: 'Sales' } });
        fireEvent.keyDown(box, { key: 'Enter' });
        expect(
            store.getState().design.regions.byId[placed.regionId].label
        ).toBe('Sales');
        expect(screen.queryByLabelText('Area name')).toBeNull();
    });

    it('EDT-206: Escape cancels and an empty name is not saved; clicking away saves', () => {
        const placed = withRegion(
            shop().design,
            { x: 0, y: 0, width: 300, height: 200 },
            'Keep'
        );
        const { store } = renderCanvas(placed.design);
        const label = () =>
            store.getState().design.regions.byId[placed.regionId].label;

        fireEvent.doubleClick(screen.getByText('Keep'));
        let box = screen.getByLabelText('Area name');
        fireEvent.change(box, { target: { value: 'Dropped' } });
        fireEvent.keyDown(box, { key: 'Escape' });
        expect(label()).toBe('Keep');

        fireEvent.doubleClick(screen.getByText('Keep'));
        box = screen.getByLabelText('Area name');
        fireEvent.change(box, { target: { value: '   ' } });
        fireEvent.keyDown(box, { key: 'Enter' });
        expect(label()).toBe('Keep');

        fireEvent.doubleClick(screen.getByText('Keep'));
        box = screen.getByLabelText('Area name');
        fireEvent.change(box, { target: { value: 'Away' } });
        fireEvent.blur(box);
        expect(label()).toBe('Away');
    });

    it('EDT-206: a read-only diagram cannot rename', () => {
        const placed = withRegion(
            shop().design,
            { x: 0, y: 0, width: 300, height: 200 },
            'Fixed'
        );
        renderCanvas(placed.design, { store: { readonly: true } });
        fireEvent.doubleClick(screen.getByText('Fixed'));
        expect(screen.queryByLabelText('Area name')).toBeNull();
    });

    it('EDT-207, EDT-210: deleting an area keeps its tables, clears their membership, and undoes', () => {
        const base = shop().design;
        const placed = withRegion(base, {
            x: -20,
            y: -20,
            width: 400,
            height: 400,
        });
        const store = createEditorStore({ design: placed.design });
        store.getState().edit({
            type: 'group',
            commands: [
                {
                    type: 'entity.update',
                    id: Object.keys(base.entities.byId)[0],
                    patch: { regionId: placed.regionId },
                },
            ],
        });
        store.getState().select([placed.regionId]);
        expect(deleteSelection(store)).toBe(true);
        const after = store.getState().design;
        expect(after.regions.order).toHaveLength(0);
        expect(after.entities.order).toHaveLength(3);
        expect(
            Object.values(after.entities.byId).every(
                (e) => e.regionId === undefined
            )
        ).toBe(true);
        store.getState().undo();
        expect(store.getState().design.regions.order).toEqual([
            placed.regionId,
        ]);
    });
});

describe('notes', () => {
    it('EDT-211: a new note is empty, 200 x 150 and yellow, at the given point', () => {
        const store = createEditorStore({ design: shop().design });
        const id = addMemoAt(store, { x: 10, y: 20 })!;
        const memo = store.getState().design.memos.byId[id];
        expect(memo.body).toBe('');
        expect(memo.box).toEqual({ x: 10, y: 20, width: 200, height: 150 });
        expect(memo.tint).toBe('#ffe374');
    });

    it('EDT-212, EDT-216: a note has a coloured header, a pale body and says Empty note when empty', () => {
        const added = withMemo(shop().design);
        renderCanvas(added.design);
        const card = screen.getByTestId(`memo-${added.memoId}`);
        expect(within(card).getByText('Empty note')).toBeInTheDocument();
        expect(within(card).getByLabelText('Note colour')).toHaveValue(
            '#ffe374'
        );
        expect(memoPale('#ffe374')).toContain('hsl(var(--card))');
    });

    it('EDT-212: the header colour picker changes the colour, undoably', () => {
        const added = withMemo(shop().design);
        const { store } = renderCanvas(added.design);
        fireEvent.change(screen.getByLabelText('Note colour'), {
            target: { value: '#43d9ad' },
        });
        expect(store.getState().design.memos.byId[added.memoId].tint).toBe(
            '#43d9ad'
        );
        act(() => void store.getState().undo());
        expect(store.getState().design.memos.byId[added.memoId].tint).toBe(
            '#ffe374'
        );
        expect(asHex('rebeccapurple')).toBe('#ffe374');
    });

    it('EDT-213: double click edits; clicking away saves; Escape abandons', () => {
        const added = withMemo(shop().design, 'hello');
        const { store } = renderCanvas(added.design);
        const body = () =>
            store.getState().design.memos.byId[added.memoId].body;

        fireEvent.doubleClick(screen.getByText('hello'));
        let area = screen.getByLabelText('Note text');
        fireEvent.change(area, { target: { value: 'kept' } });
        fireEvent.blur(area);
        expect(body()).toBe('kept');

        fireEvent.doubleClick(screen.getByText('kept'));
        area = screen.getByLabelText('Note text');
        fireEvent.change(area, { target: { value: 'thrown away' } });
        fireEvent.keyDown(area, { key: 'Escape' });
        expect(body()).toBe('kept');
        expect(screen.queryByLabelText('Note text')).toBeNull();
    });

    it('EDT-217: add, edit and delete of a note are undoable', () => {
        const store = createEditorStore({ design: shop().design });
        const id = addMemoAt(store, { x: 0, y: 0 })!;
        store.getState().edit({
            type: 'item.update',
            collection: 'memos',
            id,
            patch: { body: 'x' },
        });
        store.getState().select([id]);
        deleteSelection(store);
        expect(store.getState().design.memos.order).toHaveLength(0);
        store.getState().undo();
        expect(store.getState().design.memos.byId[id].body).toBe('x');
        store.getState().undo();
        store.getState().undo();
        expect(store.getState().design.memos.order).toHaveLength(0);
    });

    it('EDT-212: a read-only note has no colour picker and cannot be edited', () => {
        const added = withMemo(shop().design, 'locked');
        renderCanvas(added.design, { store: { readonly: true } });
        expect(screen.queryByLabelText('Note colour')).toBeNull();
        fireEvent.doubleClick(screen.getByText('locked'));
        expect(screen.queryByLabelText('Note text')).toBeNull();
    });
});
