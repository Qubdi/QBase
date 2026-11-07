import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { planUpdateColumn } from '@/core/commands/plan-column';
import { withTables } from '@/core/testing/helpers';
import { FilterPanel } from '@/features/filters/filter-panel';
import { renderPanel } from '@/features/testing/render-panel';
import { TablesSection } from '../tables-section';

const firstIds = (store: ReturnType<typeof renderPanel>['store']) => {
    const d = store.getState().design;
    const entity = d.entities.byId[d.entities.order[0]];
    return { entity, column: entity.columnIds[0] };
};

describe('p8 EDT-064 group zoom-to', () => {
    it('a group zoom-to control asks the canvas to show all the tables of the group', async () => {
        const onZoomToGroup = vi.fn();
        const { store } = renderPanel(
            <FilterPanel
                onClose={() => undefined}
                onZoomToGroup={onZoomToGroup}
            />,
            withTables(['a', 'b'])
        );
        await userEvent.click(
            screen.getByRole('button', { name: /^Zoom to public/ })
        );
        expect(onZoomToGroup).toHaveBeenCalledWith(
            store.getState().design.entities.order
        );
    });
});

describe('p8 EDT-077 the Add Table split button', () => {
    it('offers Add view only while Database Views is on', async () => {
        const off = renderPanel(<TablesSection />, withTables(['a']), {
            showViews: false,
        });
        expect(
            screen.queryByRole('button', { name: 'More ways to add' })
        ).toBeNull();
        off.unmount();
        const { store } = renderPanel(<TablesSection />, withTables(['a']), {
            showViews: true,
        });
        await userEvent.click(
            screen.getByRole('button', { name: 'More ways to add' })
        );
        await userEvent.click(
            await screen.findByRole('menuitem', { name: 'Add view' })
        );
        const d = store.getState().design;
        const added = d.entities.byId[d.entities.order.at(-1)!];
        expect(added).toMatchObject({ kind: 'view', name: 'view_1' });
    });
});

describe('p8 EDT-096 renaming in the panel', () => {
    it('the name has the tooltip Double-click to edit, and a double click opens the box', async () => {
        const { store } = renderPanel(
            <TablesSection />,
            withTables(['orders'])
        );
        const name = screen.getByText('orders');
        expect(name.getAttribute('title')).toBe('Double-click to edit');
        fireEvent.doubleClick(name);
        const box = await screen.findByLabelText('Rename table');
        fireEvent.change(box, { target: { value: 'sales' } });
        fireEvent.keyDown(box, { key: 'Enter' });
        expect(
            store.getState().design.entities.byId[firstIds(store).entity.id]
                .name
        ).toBe('sales');
    });
    it('the pencil opens the box and Escape cancels', async () => {
        const { store } = renderPanel(
            <TablesSection />,
            withTables(['orders'])
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Rename table' })
        );
        const box = await screen.findByLabelText('Rename table');
        fireEvent.change(box, { target: { value: 'sales' } });
        fireEvent.keyDown(box, { key: 'Escape' });
        expect(firstIds(store).entity.name).toBe('orders');
    });
});

describe('p8 EDT-129 EDT-130 length, precision and scale', () => {
    const open = async (
        type: string,
        db: 'sql_server' | 'postgresql',
        name = type
    ) => {
        const view = renderPanel(<TablesSection />, withTables(['t'], db));
        const { entity, column } = firstIds(view.store);
        view.store.getState().edit(
            planUpdateColumn(entity.id, column, {
                type: { id: type, name },
            })
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Show or hide the details' })
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Field attributes' })
        );
        return { ...view, pop: await screen.findByRole('dialog') };
    };

    it('EDT-129: SQL Server offers None, Max and Custom with a number box', async () => {
        const { pop, store } = await open('varchar', 'sql_server');
        await userEvent.click(
            within(pop).getByRole('combobox', { name: 'Max length' })
        );
        const options = (await screen.findAllByRole('option')).map(
            (o) => o.textContent
        );
        expect(options).toEqual(['None', 'Max', 'Custom']);
        await userEvent.click(screen.getByRole('option', { name: 'Custom' }));
        const box = within(pop).getByRole('spinbutton', { name: 'Custom' });
        fireEvent.change(box, { target: { value: '40' } });
        expect(
            store.getState().design.columns[firstIds(store).column].length
        ).toBe(40);
    });

    it('EDT-129: PostgreSQL has no Max choice', async () => {
        const { pop } = await open('varchar', 'postgresql');
        await userEvent.click(
            within(pop).getByRole('combobox', { name: 'Max length' })
        );
        const options = (await screen.findAllByRole('option')).map(
            (o) => o.textContent
        );
        expect(options).toEqual(['None', 'Custom']);
    });

    it('EDT-130: precision and scale show the default as placeholder and the range limits', async () => {
        const { pop } = await open('numeric', 'postgresql');
        const boxes = within(pop).getAllByRole('spinbutton');
        expect(boxes).toHaveLength(2);
        for (const box of boxes) {
            expect(box.getAttribute('placeholder')).toMatch(/^\d+$/);
            expect(box.getAttribute('max')).toMatch(/^\d+$/);
        }
    });
});
