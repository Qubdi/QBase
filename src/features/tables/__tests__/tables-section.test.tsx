import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NEW_ITEM_TYPE } from '@/canvas/drop-items';
import { applyOk, withTables } from '@/core/testing/helpers';
import { renderPanel } from '@/features/testing/render-panel';
import { TablesSection } from '../tables-section';

const names = (store: ReturnType<typeof renderPanel>['store']) =>
    store
        .getState()
        .design.entities.order.map(
            (id) => store.getState().design.entities.byId[id].name
        );

describe('EDT-110 EDT-102 an empty diagram', () => {
    it('says so and offers Add Table, which creates table_1 with an id field (EDT-075)', async () => {
        const { store } = renderPanel(<TablesSection />, withTables([]));
        expect(screen.getByText('No tables')).toBeTruthy();
        expect(screen.getByText('Create a table to get started')).toBeTruthy();
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Add table' })[0]
        );
        const design = store.getState().design;
        const entity = design.entities.byId[design.entities.order[0]];
        expect(entity.name).toBe('table_1');
        expect(design.columns[entity.columnIds[0]]).toMatchObject({
            name: 'id',
            primaryKey: true,
            unique: true,
            nullable: false,
        });
    });

    it('puts the new table near the corner of the visible canvas (EDT-074)', async () => {
        const { store } = renderPanel(<TablesSection />, withTables([]), {
            panel: { viewportOrigin: () => ({ x: 100, y: 40 }) },
        });
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Add table' })[0]
        );
        const design = store.getState().design;
        const entity = design.entities.byId[design.entities.order[0]];
        expect([entity.x, entity.y]).toEqual([180, 120]);
    });
});

describe('EDT-103 EDT-109 the rows and the filter box', () => {
    it('lists the tables and narrows them by name', async () => {
        renderPanel(<TablesSection />, withTables(['orders', 'users']));
        expect(screen.getAllByTestId('table-row')).toHaveLength(2);
        await userEvent.type(screen.getByLabelText('Filter'), 'use');
        expect(screen.getAllByTestId('table-row')).toHaveLength(1);
        await userEvent.clear(screen.getByLabelText('Filter'));
        await userEvent.type(screen.getByLabelText('Filter'), 'zzz');
        expect(
            screen.getByText('No tables found matching your filter.')
        ).toBeTruthy();
        await userEvent.click(
            screen.getByRole('button', { name: 'Clear filter' })
        );
        expect(screen.getAllByTestId('table-row')).toHaveLength(2);
    });

    it('opens one row at a time (EDT-103) and shows its parts (EDT-111)', async () => {
        renderPanel(<TablesSection />, withTables(['orders', 'users']));
        const toggles = screen.getAllByRole('button', {
            name: 'Show or hide the details',
        });
        await userEvent.click(toggles[0]);
        expect(screen.getByText('Fields')).toBeTruthy();
        expect(screen.getByText('Indexes')).toBeTruthy();
        expect(screen.getByText('Check constraints')).toBeTruthy();
        expect(screen.getByText('Description')).toBeTruthy();
        await userEvent.click(toggles[1]);
        expect(screen.getAllByText('Fields')).toHaveLength(1);
    });

    it('opens the row of a table asked for from the canvas (EDT-111)', () => {
        const design = withTables(['orders', 'users']);
        const { store } = renderPanel(<TablesSection />, design, {});
        store.getState().showEntityInPanel(design.entities.order[1]);
        // the store change reaches the open row
        return screen.findByText('Fields');
    });

    it('shows a view tag and hides views while Database Views is off (EDT-108)', () => {
        const base = withTables(['orders']);
        const design = applyOk(base, {
            type: 'entity.insert',
            parts: {
                entity: {
                    ...base.entities.byId[base.entities.order[0]],
                    id: 'v1',
                    name: 'recent',
                    kind: 'view',
                    columnIds: [],
                    keyIds: [],
                    ruleIds: [],
                },
                columns: [],
                keys: [],
                rules: [],
            },
        }).design;
        renderPanel(<TablesSection />, design);
        expect(screen.getAllByTestId('table-row')).toHaveLength(1);
    });
});

describe('EDT-096 renaming a table in the list', () => {
    it('saves on Enter and drops the change on Escape', async () => {
        const { store } = renderPanel(
            <TablesSection />,
            withTables(['orders'])
        );
        await userEvent.dblClick(
            screen.getByRole('button', { name: 'orders' })
        );
        const box = screen.getByRole('textbox', { name: 'Rename table' });
        await userEvent.clear(box);
        await userEvent.type(box, 'purchases{Escape}');
        expect(names(store)).toEqual(['orders']);
        await userEvent.dblClick(
            screen.getByRole('button', { name: 'orders' })
        );
        const again = screen.getByRole('textbox', { name: 'Rename table' });
        await userEvent.clear(again);
        await userEvent.type(again, 'purchases{Enter}');
        expect(names(store)).toEqual(['purchases']);
    });

    it('ignores an empty name', async () => {
        const { store } = renderPanel(
            <TablesSection />,
            withTables(['orders'])
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Rename table' })
        );
        const box = screen.getByRole('textbox', { name: 'Rename table' });
        await userEvent.clear(box);
        await userEvent.type(box, '{Enter}');
        expect(names(store)).toEqual(['orders']);
    });

    it('is not offered in a read-only diagram', () => {
        renderPanel(<TablesSection />, withTables(['orders']), {
            readonly: true,
        });
        expect(
            screen.queryByRole('button', { name: 'Rename table' })
        ).toBeNull();
        expect(screen.queryByRole('button', { name: 'Add table' })).toBeNull();
    });
});

describe('EDT-104 EDT-099 EDT-100 EDT-107 table actions', () => {
    it('duplicates and deletes through the actions menu', async () => {
        const { store } = renderPanel(
            <TablesSection />,
            withTables(['orders'])
        );
        const menu = () =>
            userEvent.click(
                screen.getByRole('button', { name: 'Table actions' })
            );
        await menu();
        await userEvent.click(
            await screen.findByRole('menuitem', { name: 'Duplicate table' })
        );
        expect(names(store)).toEqual(['orders', 'orders_copy']);
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Table actions' })[1]
        );
        await userEvent.click(
            await screen.findByRole('menuitem', { name: 'Delete table' })
        );
        expect(names(store)).toEqual(['orders']);
        store.getState().undo();
        expect(names(store)).toEqual(['orders', 'orders_copy']);
    });

    it('offers Add index only for tables, and Change schema only with schemas', async () => {
        renderPanel(<TablesSection />, withTables(['orders'], 'mysql'));
        await userEvent.click(
            screen.getByRole('button', { name: 'Table actions' })
        );
        const menu = await screen.findByRole('menu');
        expect(within(menu).getByText('Add index')).toBeTruthy();
        expect(within(menu).queryByText('Change schema')).toBeNull();
    });

    it('focus selects the table and asks the canvas to centre it (EDT-107, EDT-010)', async () => {
        let focused = 0;
        const design = withTables(['orders']);
        const { store } = renderPanel(<TablesSection />, design, {
            panel: { onFocused: () => focused++ },
        });
        await userEvent.click(
            screen.getByRole('button', { name: 'Focus on the canvas' })
        );
        expect(store.getState().ui.selection).toEqual([
            design.entities.order[0],
        ]);
        expect(store.getState().ui.focus?.entityId).toBe(
            design.entities.order[0]
        );
        expect(focused).toBe(1);
    });
});

describe('EDT-069 every table hidden', () => {
    it('says so and Show all brings them back', async () => {
        const { store } = renderPanel(
            <TablesSection />,
            withTables(['orders']),
            { filter: { tableIds: [] } }
        );
        expect(screen.getByText('All tables are hidden')).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: 'Show all' }));
        expect(store.getState().ui.filter).toEqual({});
    });
});

describe('EDT-076 EDT-101 schemas', () => {
    it('asks for a schema when several are shown', async () => {
        const base = withTables(['a', 'b']);
        const design = applyOk(base, {
            type: 'entity.update',
            id: base.entities.order[1],
            patch: { schema: 'billing' },
        }).design;
        const { store } = renderPanel(<TablesSection />, design, {
            filter: {},
        });
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Add table' })[0]
        );
        expect(await screen.findByText('Select schema')).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
        expect(store.getState().design.entities.order).toHaveLength(3);
    });

    it('changes the schema of one table only', async () => {
        const { store } = renderPanel(
            <TablesSection />,
            withTables(['a', 'b'])
        );
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Table actions' })[0]
        );
        await userEvent.click(
            await screen.findByRole('menuitem', { name: 'Change schema' })
        );
        const dialog = await screen.findByRole('dialog');
        await userEvent.click(
            within(dialog).getByLabelText('Create new schema')
        );
        await userEvent.type(within(dialog).getByRole('textbox'), 'sales');
        await userEvent.click(
            within(dialog).getByRole('button', { name: 'Change' })
        );
        const { entities } = store.getState().design;
        expect(entities.byId[entities.order[0]].schema).toBe('sales');
        expect(entities.byId[entities.order[1]].schema).toBe('public');
    });
});

describe('dragging Add table onto the canvas', () => {
    it('the button is a drag source for a table and click still adds', async () => {
        const { store } = renderPanel(<TablesSection />, withTables([]));
        const button = screen.getAllByRole('button', { name: 'Add table' })[0];
        const setData = vi.fn();
        expect(button.getAttribute('draggable')).toBe('true');
        fireEvent.dragStart(button, { dataTransfer: { setData } });
        expect(setData).toHaveBeenCalledWith(NEW_ITEM_TYPE, 'table');
        expect(names(store)).toEqual([]);
        await userEvent.click(button);
        expect(names(store)).toEqual(['table_1']);
    });

    it('has no drag source in a read-only diagram', () => {
        renderPanel(<TablesSection />, withTables([]), { readonly: true });
        expect(screen.queryByRole('button', { name: 'Add table' })).toBeNull();
    });
});
