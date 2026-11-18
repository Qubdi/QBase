import React from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { withFields } from '@/core/testing/helpers';
import { renderPanel } from '@/features/testing/render-panel';
import { selectFilter } from '@/store/selectors';
import { FilterPanel } from '../filter-panel';

// The panel finds a table by its name and by the names of its fields (design/
// column-search, option A): the fields that match are listed under their table
// with the text marked, and a click on one shows the table, centres it and
// focuses the field on the canvas.

const fields = () =>
    withFields({
        customers: ['email'],
        orders: ['customer_email', 'notify_email', 'total'],
        users: [
            'email',
            'email_verified_at',
            'backup_email',
            'work_email',
            'recovery_email',
        ],
        products: ['sku'],
    });

const show = (options: Parameters<typeof renderPanel>[2] = {}) => {
    const design = fields();
    return {
        design,
        ...renderPanel(
            <FilterPanel onClose={() => undefined} />,
            design,
            options
        ),
    };
};

const search = (text: string) =>
    userEvent.type(screen.getByLabelText('Search tables or fields...'), text);
const tableNames = () =>
    screen.getAllByTestId('filter-table').map((row) => row.textContent);
/** the buttons of the fields listed under a table row */
const fieldNames = (table: string) =>
    within(
        screen
            .getAllByTestId('filter-table')
            .find((row) => row.textContent === table)!
            .nextElementSibling as HTMLElement
    )
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label') ?? b.textContent);

describe('the search finds fields as well as tables', () => {
    it('is called Search & Filter and says it looks for fields', () => {
        show();
        expect(
            screen.getByRole('dialog', { name: 'Search & Filter' })
        ).toBeTruthy();
        expect(
            screen.getByPlaceholderText('Search tables or fields...')
        ).toBeTruthy();
    });

    it('lists the tables that have a field with the text, and those fields under them', async () => {
        show();
        await search('email');
        expect(tableNames()).toEqual(['customers', 'orders', 'users']);
        expect(fieldNames('customers')).toEqual(['Focus customers.email']);
        expect(fieldNames('orders')).toEqual([
            'Focus orders.customer_email',
            'Focus orders.notify_email',
        ]);
    });

    it('marks the text where it is found', async () => {
        show();
        await search('mail');
        const marks = screen
            .getAllByTestId('filter-fields')[0]
            .querySelectorAll('mark');
        expect([...marks].map((m) => m.textContent)).toEqual(['mail']);
    });

    it('says the type of each field', async () => {
        const { design } = show();
        await search('sku');
        const sku = Object.values(design.columns).find(
            (c) => c.name === 'sku'
        )!;
        expect(screen.getByTestId('filter-fields').textContent).toBe(
            `sku${sku.type.name}`
        );
    });

    it('lists a table found by its name only, with no fields', async () => {
        show();
        await search('prod');
        expect(tableNames()).toEqual(['products']);
        expect(screen.queryByTestId('filter-fields')).toBeNull();
    });

    it('shows the first three fields of a table and the rest on request', async () => {
        show();
        await search('email');
        // three fields and the "Show n more" button
        expect(fieldNames('users')).toHaveLength(3 + 1);
        await userEvent.click(
            screen.getByRole('button', { name: 'Show 2 more' })
        );
        expect(fieldNames('users')).toHaveLength(5 + 1);
        await userEvent.click(
            screen.getByRole('button', { name: 'Show fewer' })
        );
        expect(fieldNames('users')).toHaveLength(3 + 1);
    });

    it('selects the table and focuses the field when one is clicked', async () => {
        const { store, design } = show();
        await search('email');
        await userEvent.click(
            screen.getByRole('button', { name: 'Focus orders.notify_email' })
        );
        const orders = design.entities.order[1];
        const state = store.getState();
        expect(state.ui.selection).toEqual([orders]);
        expect(state.ui.focusColumn).toEqual({
            entityId: orders,
            columnId: design.entities.byId[orders].columnIds[2],
        });
    });

    it('shows a hidden table when one of its fields is clicked', async () => {
        const design = fields();
        const [customers, orders] = design.entities.order;
        const { store } = renderPanel(
            <FilterPanel onClose={() => undefined} />,
            design,
            { filter: { tableIds: [orders] } }
        );
        await search('email');
        await userEvent.click(
            screen.getByRole('button', { name: 'Focus customers.email' })
        );
        expect(selectFilter(store.getState()).tableIds).toContain(customers);
        expect(store.getState().ui.selection).toEqual([customers]);
    });

    it('does not change what is hidden, and clearing the text brings the plain list back', async () => {
        const design = fields();
        const { store } = renderPanel(
            <FilterPanel onClose={() => undefined} />,
            design,
            { filter: { tableIds: [design.entities.order[0]] } }
        );
        await search('email');
        expect(selectFilter(store.getState())).toEqual({
            tableIds: [design.entities.order[0]],
        });
        await userEvent.clear(
            screen.getByLabelText('Search tables or fields...')
        );
        expect(screen.getAllByTestId('filter-table')).toHaveLength(4);
        expect(screen.queryByTestId('filter-fields')).toBeNull();
    });
});
