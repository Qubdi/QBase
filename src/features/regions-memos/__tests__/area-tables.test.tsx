import React from 'react';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Design } from '@/core/model/design';
import { applyOk, withTables } from '@/core/testing/helpers';
import { renderPanel } from '@/features/testing/render-panel';
import { areaTables } from '../visual-lists';
import { VisualsSection } from '../visuals-section';

// The Areas list says which tables are in which area: a row opens to its tables,
// the way a relationship of the Refs list opens to its tables and fields, and a
// last row holds the tables that are in no area (design/area-tables). Each table
// records its area, so nothing here measures a rectangle.

/** three areas (Sales, Billing, Archive) and the tables placed in them */
function design(options: { views?: boolean } = {}): Design {
    let d = withTables([
        'orders',
        'customers',
        'invoices',
        'products',
        'users',
    ]);
    const ids = d.entities.order;
    for (const [id, label] of [
        ['r1', 'Sales'],
        ['r2', 'Billing'],
        ['r3', 'Archive'],
    ])
        d = applyOk(d, {
            type: 'item.insert',
            collection: 'regions',
            item: {
                id,
                label,
                tint: '#3b82f6',
                box: { x: 0, y: 0, width: 1, height: 1 },
            },
        }).design;
    const place = (index: number, regionId: string | undefined) => {
        d = applyOk(d, {
            type: 'entity.update',
            id: ids[index],
            patch: { regionId },
        }).design;
    };
    place(0, 'r1'); // orders
    place(1, 'r1'); // customers
    place(2, 'r2'); // invoices
    // products and users are in no area
    if (options.views) {
        d = applyOk(d, {
            type: 'entity.update',
            id: ids[3],
            patch: { kind: 'view', regionId: 'r2' },
        }).design;
    }
    return d;
}

const row = (name: string) =>
    screen
        .getAllByTestId('area-row')
        .find((r) => within(r).queryByRole('button', { name }))!;
const toggle = (area: string) =>
    screen.getByRole('button', { name: `Show or hide the tables: ${area}` });
const namesIn = (el: HTMLElement) =>
    within(within(el).getByTestId('area-tables'))
        .getAllByRole('button')
        .map((b) => b.textContent);

describe('areaTables', () => {
    it('groups the tables by the area they record, in the design order', () => {
        const { inside, outside } = areaTables(design(), false);
        expect(inside.get('r1')?.map((e) => e.name)).toEqual([
            'orders',
            'customers',
        ]);
        expect(inside.get('r2')?.map((e) => e.name)).toEqual(['invoices']);
        expect(inside.has('r3')).toBe(false);
        expect(outside.map((e) => e.name)).toEqual(['products', 'users']);
    });

    it('counts a table that records an area that is not there as outside', () => {
        const base = design();
        const d = applyOk(base, {
            type: 'entity.update',
            id: base.entities.order[0],
            patch: { regionId: 'ghost' },
        }).design;
        const { inside, outside } = areaTables(d, false);
        expect(inside.has('ghost')).toBe(false);
        expect(outside.map((e) => e.name)).toContain('orders');
    });

    it('leaves views out while Database Views is off', () => {
        const d = design({ views: true });
        expect(
            areaTables(d, false)
                .inside.get('r2')
                ?.map((e) => e.name)
        ).toEqual(['invoices']);
        expect(
            areaTables(d, true)
                .inside.get('r2')
                ?.map((e) => e.name)
        ).toEqual(['invoices', 'products']);
    });
});

describe('the Areas list opens to the tables of each area', () => {
    it('starts closed, with the number of tables on every area row', () => {
        renderPanel(<VisualsSection />, design());
        for (const [area, count] of [
            ['Sales', '2'],
            ['Billing', '1'],
            ['Archive', '0'],
        ]) {
            const r = row(`Show or hide the tables: ${area}`);
            expect(within(r).queryByTestId('area-tables')).toBeNull();
            expect(
                within(r).getByTitle(`Tables: ${count}`).textContent
            ).toContain(count);
            expect(toggle(area).getAttribute('aria-expanded')).toBe('false');
        }
    });

    it('opens an area to its tables, in the order of the Tables list, and closes it again', async () => {
        renderPanel(<VisualsSection />, design());
        await userEvent.click(toggle('Sales'));
        expect(toggle('Sales').getAttribute('aria-expanded')).toBe('true');
        expect(namesIn(row('Show or hide the tables: Sales'))).toEqual([
            'orders',
            'customers',
        ]);
        // the other areas stay closed
        expect(
            within(row('Show or hide the tables: Billing')).queryByTestId(
                'area-tables'
            )
        ).toBeNull();
        await userEvent.click(toggle('Sales'));
        expect(screen.queryByText('orders')).toBeNull();
    });

    it('opens on a click on the name too, and still renames on the pencil', async () => {
        const { store } = renderPanel(<VisualsSection />, design());
        const r = row('Show or hide the tables: Sales');
        await userEvent.click(within(r).getByText('Sales'));
        expect(namesIn(r)).toEqual(['orders', 'customers']);
        await userEvent.click(
            within(r).getByRole('button', { name: 'Edit name' })
        );
        const box = screen.getByRole('textbox', { name: 'Edit name' });
        await userEvent.clear(box);
        await userEvent.type(box, 'Shop{Enter}');
        expect(store.getState().design.regions.byId.r1.label).toBe('Shop');
    });

    it('says so when an open area has no tables', async () => {
        renderPanel(<VisualsSection />, design());
        await userEvent.click(toggle('Archive'));
        expect(screen.getByText('No tables in this area')).toBeTruthy();
    });

    it('selects a table and asks the canvas to centre it when it is clicked', async () => {
        const d = design();
        const { store } = renderPanel(<VisualsSection />, d);
        await userEvent.click(toggle('Sales'));
        await userEvent.click(
            screen.getByRole('button', { name: 'customers' })
        );
        expect(store.getState().ui.selection).toEqual([d.entities.order[1]]);
    });

    it('follows a table that moves to another area', async () => {
        const d = design();
        const { store } = renderPanel(<VisualsSection />, d);
        await userEvent.click(toggle('Sales'));
        await userEvent.click(toggle('Billing'));
        act(() => {
            store.getState().edit({
                type: 'entity.update',
                id: d.entities.order[0],
                patch: { regionId: 'r2' },
            });
        });
        expect(namesIn(row('Show or hide the tables: Sales'))).toEqual([
            'customers',
        ]);
        expect(namesIn(row('Show or hide the tables: Billing'))).toEqual([
            'orders',
            'invoices',
        ]);
    });

    it('names the schema of a table only where the Tables list does', async () => {
        let d = design();
        d = applyOk(d, {
            type: 'entity.update',
            id: d.entities.order[0],
            patch: { schema: 'sales' },
        }).design;
        d = applyOk(d, {
            type: 'entity.update',
            id: d.entities.order[1],
            patch: { schema: 'public' },
        }).design;
        renderPanel(<VisualsSection />, d);
        await userEvent.click(toggle('Sales'));
        const lines = within(
            within(row('Show or hide the tables: Sales')).getByTestId(
                'area-tables'
            )
        ).getAllByRole('button');
        expect(lines[0].textContent).toBe('orderssales');
        expect(lines[1].textContent).toBe('customerspublic');
    });
});

describe('the tables that are in no area', () => {
    const outsideRow = () => screen.getByTestId('outside-row');
    const outsideToggle = () =>
        screen.getByRole('button', {
            name: 'Show or hide the tables: Tables outside every area',
        });

    it('are a closed row after the areas, with their number', () => {
        renderPanel(<VisualsSection />, design());
        expect(outsideRow().textContent).toContain('Tables outside every area');
        expect(within(outsideRow()).getByTitle('Tables: 2')).toBeTruthy();
        expect(within(outsideRow()).queryByTestId('area-tables')).toBeNull();
    });

    it('open to their tables, and a click on one selects it', async () => {
        const d = design();
        const { store } = renderPanel(<VisualsSection />, d);
        await userEvent.click(outsideToggle());
        expect(namesIn(outsideRow())).toEqual(['products', 'users']);
        await userEvent.click(within(outsideRow()).getByText('users'));
        expect(store.getState().ui.selection).toEqual([d.entities.order[4]]);
    });

    it('are not listed when every table is in an area', () => {
        let d = design();
        for (const id of d.entities.order)
            d = applyOk(d, {
                type: 'entity.update',
                id,
                patch: { regionId: 'r3' },
            }).design;
        renderPanel(<VisualsSection />, d);
        expect(screen.queryByTestId('outside-row')).toBeNull();
    });

    it('are not listed when there is no area at all', () => {
        renderPanel(<VisualsSection />, withTables(['orders']));
        expect(screen.getByText('No areas')).toBeTruthy();
        expect(screen.queryByTestId('outside-row')).toBeNull();
    });

    it('are left out while the list is narrowed by the filter', async () => {
        renderPanel(<VisualsSection />, design());
        await userEvent.type(screen.getByLabelText('Filter'), 'Sal');
        expect(screen.getAllByTestId('area-row')).toHaveLength(1);
        expect(screen.queryByTestId('outside-row')).toBeNull();
    });
});
