import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { createEditorStore } from '@/store/editor-store';
import { shop, withRegion } from './test/fixtures';
import { renderCanvas } from './test/render';
import { dropNewItem, NEW_ITEM_TYPE, newItemDragProps } from './drop-items';

const transfer = (kind: string) => ({
    types: [NEW_ITEM_TYPE],
    getData: (type: string) => (type === NEW_ITEM_TYPE ? kind : ''),
    dropEffect: 'none',
});

describe('dragging a new item from the side panel', () => {
    it('a drag source puts the kind under the new-item data type', () => {
        const setData = vi.fn();
        const props = newItemDragProps('area');
        expect(props.draggable).toBe(true);
        props.onDragStart?.({
            dataTransfer: { setData, effectAllowed: 'none' },
        });
        expect(setData).toHaveBeenCalledWith(NEW_ITEM_TYPE, 'area');
    });

    it('nothing is draggable when the diagram is read-only', () => {
        expect(newItemDragProps('table', false)).toEqual({ draggable: false });
    });

    it('dropping on the canvas creates the item as one undo step', () => {
        const { store } = renderCanvas(shop().design);
        const before = store.getState().design.entities.order.length;
        const undoBefore = store.getState().history.undo.length;
        fireEvent.drop(screen.getByTestId('diagram-canvas'), {
            dataTransfer: transfer('table'),
            clientX: 120,
            clientY: 80,
        });
        expect(store.getState().design.entities.order).toHaveLength(before + 1);
        expect(store.getState().history.undo).toHaveLength(undoBefore + 1);
        fireEvent.drop(screen.getByTestId('diagram-canvas'), {
            dataTransfer: transfer('note'),
        });
        fireEvent.drop(screen.getByTestId('diagram-canvas'), {
            dataTransfer: transfer('area'),
        });
        expect(store.getState().design.memos.order).toHaveLength(1);
        expect(store.getState().design.regions.order).toHaveLength(1);
    });

    it('a note dropped on a column row belongs to that column, not to its table', () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        fireEvent.drop(screen.getByTestId(`field-${s.orderUser}`), {
            dataTransfer: transfer('note'),
        });
        const { memos } = store.getState().design;
        expect(memos.order).toHaveLength(1);
        expect(memos.byId[memos.order[0]].anchor).toEqual({
            kind: 'column',
            id: s.orderUser,
        });
    });

    it('a note dropped on a column row inside an area still belongs to the column', () => {
        const s = shop();
        const placed = withRegion(s.design, {
            x: -50,
            y: -50,
            width: 1000,
            height: 400,
        });
        const { store } = renderCanvas(placed.design);
        fireEvent.drop(screen.getByTestId(`field-${s.orderUser}`), {
            dataTransfer: transfer('note'),
        });
        const { memos } = store.getState().design;
        expect(memos.byId[memos.order[0]].anchor).toEqual({
            kind: 'column',
            id: s.orderUser,
        });
    });

    it('a note dropped on the background still goes to the area or table it is nearest to', () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        fireEvent.drop(screen.getByTestId('diagram-canvas'), {
            dataTransfer: transfer('note'),
        });
        const { memos } = store.getState().design;
        expect(memos.byId[memos.order[0]].anchor?.kind).toBe('entity');
    });

    it('a column that is no longer in the design falls back to the nearest owner', () => {
        const store = createEditorStore({ design: shop().design });
        expect(
            dropNewItem(
                store,
                'note',
                { x: 10, y: 20 },
                undefined,
                undefined,
                'gone'
            )
        ).toBe(true);
        const { memos } = store.getState().design;
        expect(memos.byId[memos.order[0]].anchor?.kind).not.toBe('column');
    });

    it('dropping in a read-only diagram does nothing', () => {
        const { store } = renderCanvas(shop().design, {
            store: { readonly: true },
        });
        const before = store.getState().design.entities.order.length;
        fireEvent.drop(screen.getByTestId('diagram-canvas'), {
            dataTransfer: transfer('table'),
        });
        expect(store.getState().design.entities.order).toHaveLength(before);
    });
});
