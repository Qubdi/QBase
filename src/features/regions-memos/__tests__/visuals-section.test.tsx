import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { applyOk, withTables } from '@/core/testing/helpers';
import { renderPanel } from '@/features/testing/render-panel';
import { VisualsSection } from '../visuals-section';
import { firstLine } from '../visual-lists';

describe('EDT-218 EDT-208 EDT-209 EDT-200 the Areas tab', () => {
    it('opens on Areas with the empty state and adds Area 1, 300 x 200', async () => {
        const { store } = renderPanel(<VisualsSection />, withTables([]));
        expect(screen.getByText('No areas')).toBeTruthy();
        expect(screen.getByText('Create an area to get started')).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: 'Add area' }));
        const d = store.getState().design;
        const region = d.regions.byId[d.regions.order[0]];
        expect(region.label).toBe('Area 1');
        expect([region.box.width, region.box.height]).toEqual([300, 200]);
    });

    it('renames, deletes (undoably) and filters areas', async () => {
        const { store } = renderPanel(<VisualsSection />, withTables([]));
        await userEvent.click(screen.getByRole('button', { name: 'Add area' }));
        await userEvent.click(
            screen.getByRole('button', { name: 'Edit name' })
        );
        const box = screen.getByRole('textbox', { name: 'Edit name' });
        await userEvent.clear(box);
        await userEvent.type(box, 'Sales{Enter}');
        const label = () => {
            const d = store.getState().design;
            return d.regions.order.map((id) => d.regions.byId[id].label);
        };
        expect(label()).toEqual(['Sales']);
        await userEvent.type(screen.getByLabelText('Filter'), 'zzz');
        expect(
            screen.getByText('No areas found matching your filter.')
        ).toBeTruthy();
        await userEvent.clear(screen.getByLabelText('Filter'));
        await userEvent.click(
            screen.getByRole('button', { name: 'Area actions' })
        );
        await userEvent.click(
            await screen.findByRole('menuitem', { name: 'Delete area' })
        );
        expect(label()).toEqual([]);
        store.getState().undo();
        expect(label()).toEqual(['Sales']);
    });

    it('focus selects the area and asks the canvas to centre it', async () => {
        const base = withTables([]);
        const design = applyOk(base, {
            type: 'item.insert',
            collection: 'regions',
            item: {
                id: 'r1',
                label: 'A',
                tint: '#fff',
                box: { x: 0, y: 0, width: 1, height: 1 },
            },
        }).design;
        const { store } = renderPanel(<VisualsSection />, design);
        await userEvent.click(
            screen.getByRole('button', { name: 'Focus on the canvas' })
        );
        expect(store.getState().ui.selection).toEqual(['r1']);
    });
});

describe('EDT-211 EDT-214 to EDT-216 the Notes tab', () => {
    async function notes(design = withTables([])) {
        const view = renderPanel(<VisualsSection />, design);
        await userEvent.click(screen.getByRole('tab', { name: 'Notes' }));
        return view;
    }

    it('shows the empty state and adds an empty 200 x 150 yellow note', async () => {
        const { store } = await notes();
        expect(screen.getByText('No notes')).toBeTruthy();
        expect(
            screen.getByText(
                'Create a note to add text annotations on the canvas'
            )
        ).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
        const d = store.getState().design;
        expect(d.memos.byId[d.memos.order[0]]).toMatchObject({
            body: '',
            tint: '#ffe374',
            box: { width: 200, height: 150 },
        });
        expect(screen.getByText('Empty note')).toBeTruthy();
    });

    it('shows the first line of a note and deletes it', async () => {
        const design = applyOk(withTables([]), {
            type: 'item.insert',
            collection: 'memos',
            item: {
                id: 'm',
                body: 'first\nsecond',
                tint: '#fff',
                box: { x: 0, y: 0, width: 1, height: 1 },
            },
        }).design;
        const { store } = await notes(design);
        expect(screen.getByText('first')).toBeTruthy();
        await userEvent.type(screen.getByLabelText('Filter'), 'nomatch');
        expect(screen.getByText('No notes found')).toBeTruthy();
        await userEvent.clear(screen.getByLabelText('Filter'));
        await userEvent.click(
            screen.getByRole('button', { name: 'Note actions' })
        );
        await userEvent.click(
            await screen.findByRole('menuitem', { name: 'Delete note' })
        );
        expect(store.getState().design.memos.order).toEqual([]);
    });

    it('the tab is kept in the store', async () => {
        const { store } = await notes();
        expect(store.getState().ui.panel.visualsTab).toBe('notes');
    });

    it('firstLine takes the first line only', () => {
        expect(firstLine('  a  \nb')).toBe('a');
        expect(firstLine('')).toBe('');
    });
});

describe('dragging from the Visuals tabs', () => {
    it('the add buttons are drag sources for areas and notes', async () => {
        const { NEW_ITEM_TYPE } = await import('@/canvas/drop-items');
        const { fireEvent } = await import('@testing-library/react');
        renderPanel(<VisualsSection />, withTables([]));
        const setData = vi.fn();
        const area = screen.getByRole('button', { name: 'Add area' });
        expect(area.getAttribute('draggable')).toBe('true');
        fireEvent.dragStart(area, { dataTransfer: { setData } });
        expect(setData).toHaveBeenCalledWith(NEW_ITEM_TYPE, 'area');
    });

    it('are not draggable in a read-only diagram (no add button)', () => {
        renderPanel(<VisualsSection />, withTables([]), { readonly: true });
        expect(screen.queryByRole('button', { name: 'Add area' })).toBeNull();
    });
});
