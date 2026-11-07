import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { shop } from './test/fixtures';
import { renderCanvas } from './test/render';
import { NEW_ITEM_TYPE, newItemDragProps } from './drop-items';

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
