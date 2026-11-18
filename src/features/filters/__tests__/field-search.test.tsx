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

describe('the switches in the search box say where the text is looked for', () => {
    const box = () => screen.getByRole('textbox');
    const tablesSwitch = () =>
        screen.getByRole('button', { name: 'Search in table names' });
    const fieldsSwitch = () =>
        screen.getByRole('button', { name: 'Search in field names' });
    const typed = async (text: string) => {
        await userEvent.clear(box());
        await userEvent.type(box(), text);
    };

    it('are both on to begin with', () => {
        show();
        expect(tablesSwitch().getAttribute('aria-pressed')).toBe('true');
        expect(fieldsSwitch().getAttribute('aria-pressed')).toBe('true');
    });

    it('with Fields off, search table names only: no fields are read or listed', async () => {
        show();
        await userEvent.click(fieldsSwitch());
        expect(fieldsSwitch().getAttribute('aria-pressed')).toBe('false');
        expect(box().getAttribute('placeholder')).toBe('Search tables...');
        await typed('email');
        expect(screen.getByText('No tables found')).toBeTruthy();
        await typed('prod');
        expect(tableNames()).toEqual(['products']);
        expect(screen.queryByTestId('filter-fields')).toBeNull();
    });

    it('with Tables off, search field names only: a table found by its name alone is left out', async () => {
        show();
        await userEvent.click(tablesSwitch());
        expect(tablesSwitch().getAttribute('aria-pressed')).toBe('false');
        expect(box().getAttribute('placeholder')).toBe('Search fields...');
        await typed('prod');
        expect(screen.getByText('No tables found')).toBeTruthy();
        await typed('email');
        expect(tableNames()).toEqual(['customers', 'orders', 'users']);
        expect(fieldNames('customers')).toEqual(['Focus customers.email']);
    });

    it('switch back to looking in both', async () => {
        show();
        await userEvent.click(fieldsSwitch());
        await userEvent.click(fieldsSwitch());
        expect(box().getAttribute('placeholder')).toBe(
            'Search tables or fields...'
        );
        await typed('email');
        expect(tableNames()).toEqual(['customers', 'orders', 'users']);
    });

    it('keep one of the two on: the last one cannot be switched off', async () => {
        show();
        await userEvent.click(fieldsSwitch());
        await userEvent.click(tablesSwitch());
        expect(tablesSwitch().getAttribute('aria-pressed')).toBe('true');
        expect(fieldsSwitch().getAttribute('aria-pressed')).toBe('false');
    });

    it('leave the focus in the box, so typing can go on', async () => {
        show();
        await userEvent.click(fieldsSwitch());
        expect(document.activeElement).toBe(box());
    });

    it('do not change what is hidden', async () => {
        const design = fields();
        const { store } = renderPanel(
            <FilterPanel onClose={() => undefined} />,
            design,
            { filter: { tableIds: [design.entities.order[0]] } }
        );
        await userEvent.click(tablesSwitch());
        await typed('email');
        expect(selectFilter(store.getState())).toEqual({
            tableIds: [design.entities.order[0]],
        });
    });
});
