import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PICKER_LIMIT } from '../picker-rows';
import type { PickerRow } from '../picker-rows';
import { TablePicker } from '../table-picker';

const row = (schema: string, name: string, view = false): PickerRow => ({
    key: `${schema}.${name}`,
    schema,
    name,
    view,
});

/** `count` tables called t000, t001, ... in the public schema. */
const many = (count: number, schema = 'public') =>
    Array.from({ length: count }, (_, i) =>
        row(schema, `t${String(i).padStart(3, '0')}`)
    );

/** The picker over its own state, as the import box keeps it. */
const Harness: React.FC<{
    rows: PickerRow[];
    initial?: Iterable<string>;
    spy?: (next: Set<string>) => void;
}> = ({ rows, initial = [], spy }) => {
    const [selected, setSelected] = useState(() => new Set(initial));
    return (
        <TablePicker
            rows={rows}
            selected={selected}
            onChange={(next) => {
                spy?.(next);
                setSelected(next);
            }}
        />
    );
};

const show = (rows: PickerRow[], initial?: Iterable<string>) => {
    const spy = vi.fn();
    render(<Harness rows={rows} initial={initial} spy={spy} />);
    return spy;
};

const summary = () => screen.getByText(/chosen \(at most/).textContent;
const listed = () =>
    within(screen.getByRole('list'))
        .getAllByRole('listitem')
        .map((li) => li.textContent);
const box = (name: string | RegExp) => screen.getByRole('checkbox', { name });

describe('TablePicker', () => {
    const mixed = [
        row('public', 'users'),
        row('public', 'orders'),
        row('sales', 'invoices'),
        row('sales', 'open_invoices', true),
    ];

    it('lists every table and view, with its schema, and tags the views', () => {
        show(mixed);
        expect(
            screen.getByRole('region', { name: 'Choose what to bring in' })
        ).toBeInTheDocument();
        expect(listed()).toEqual([
            'public.users',
            'public.orders',
            'sales.invoices',
            'sales.open_invoicesview',
        ]);
        expect(summary()).toBe(`0 of 4 chosen (at most ${PICKER_LIMIT})`);
    });

    it('shows a name without a schema as it is', () => {
        show([row('', 'plain')]);
        expect(listed()).toEqual(['plain']);
    });

    it('ticking and unticking a row reports the new selection', async () => {
        const spy = show(mixed);
        await userEvent.click(box('public.users'));
        expect([...spy.mock.lastCall![0]]).toEqual(['public.users']);
        expect(box('public.users')).toBeChecked();
        expect(summary()).toMatch(/^1 of 4/);
        await userEvent.click(box('public.users'));
        expect([...spy.mock.lastCall![0]]).toEqual([]);
        expect(box('public.users')).not.toBeChecked();
    });

    it('a space on a focused row ticks it', async () => {
        const spy = show(mixed);
        box('sales.invoices').focus();
        await userEvent.keyboard(' ');
        expect([...spy.mock.lastCall![0]]).toEqual(['sales.invoices']);
    });

    it('searches by name, ignoring case and outer spaces', () => {
        show(mixed);
        fireEvent.change(
            screen.getByRole('textbox', { name: 'Search by name' }),
            {
                target: { value: '  INVOICE ' },
            }
        );
        expect(listed()).toEqual(['sales.invoices', 'sales.open_invoicesview']);
    });

    it('shows an empty list, and a page box that cannot be ticked, when nothing matches', async () => {
        const spy = show(mixed);
        fireEvent.change(
            screen.getByRole('textbox', { name: 'Search by name' }),
            {
                target: { value: 'nothing like this' },
            }
        );
        expect(
            within(screen.getByRole('list')).queryAllByRole('listitem')
        ).toHaveLength(0);
        const page = box('Choose everything on this page');
        expect(page).not.toBeChecked();
        await userEvent.click(page);
        // ticking an empty page adds nothing
        expect(spy.mock.lastCall![0].size).toBe(0);
    });

    it('filters by kind: tables only, views only, then both again', async () => {
        show(mixed);
        const kind = screen.getByRole('combobox', { name: 'Kind' });
        await userEvent.selectOptions(kind, 'Tables only');
        expect(listed()).toHaveLength(3);
        await userEvent.selectOptions(kind, 'Views only');
        expect(listed()).toEqual(['sales.open_invoicesview']);
        await userEvent.selectOptions(kind, 'Tables and views');
        expect(listed()).toHaveLength(4);
    });

    it('offers each schema once, sorted, and filters by it', async () => {
        show([row('sales', 'a'), row('public', 'b'), row('sales', 'c')]);
        const schema = screen.getByRole('combobox', { name: 'Schema' });
        expect(
            within(schema)
                .getAllByRole('option')
                .map((o) => o.textContent)
        ).toEqual(['All schemas', 'public', 'sales']);
        await userEvent.selectOptions(schema, 'sales');
        expect(listed()).toEqual(['sales.a', 'sales.c']);
    });

    it('"Choose everything on this page" ticks and unticks only the rows on the page', async () => {
        const spy = show(mixed, ['public.users']);
        await userEvent.selectOptions(
            screen.getByRole('combobox', { name: 'Schema' }),
            'sales'
        );
        const page = box('Choose everything on this page');
        expect(page).not.toBeChecked();
        await userEvent.click(page);
        expect([...spy.mock.lastCall![0]].sort()).toEqual([
            'public.users',
            'sales.invoices',
            'sales.open_invoices',
        ]);
        expect(page).toBeChecked();
        await userEvent.click(page);
        // the row outside the filter stays chosen
        expect([...spy.mock.lastCall![0]]).toEqual(['public.users']);
    });

    it('pages 50 rows at a time, with Previous and Next disabled at the ends', async () => {
        show(many(120));
        expect(listed()).toHaveLength(50);
        expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
        const previous = screen.getByRole('button', { name: 'Previous' });
        const next = screen.getByRole('button', { name: 'Next' });
        expect(previous).toBeDisabled();
        await userEvent.click(next);
        expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
        expect(listed()[0]).toBe('public.t050');
        await userEvent.click(next);
        expect(listed()).toHaveLength(20);
        expect(next).toBeDisabled();
        await userEvent.click(previous);
        expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    });

    it('has no pager for a single page', () => {
        show(many(50));
        expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    });

    it('goes back to the first page when the search changes', async () => {
        show(many(120));
        await userEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.change(
            screen.getByRole('textbox', { name: 'Search by name' }),
            {
                target: { value: 't0' },
            }
        );
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });

    it('stays on the last page that still exists when the rows shrink under it', async () => {
        const rows = many(120);
        const view = render(<Harness rows={rows} />);
        await userEvent.click(screen.getByRole('button', { name: 'Next' }));
        await userEvent.click(screen.getByRole('button', { name: 'Next' }));
        view.rerender(<Harness rows={rows.slice(0, 60)} />);
        expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
        expect(listed()).toHaveLength(10);
    });

    it(`never selects more than ${PICKER_LIMIT}, one at a time or a page at a time`, async () => {
        const rows = many(PICKER_LIMIT + 60);
        const full = rows.slice(0, PICKER_LIMIT).map((r) => r.key);
        const spy = show(rows, full);
        expect(summary()).toBe(
            `${PICKER_LIMIT} of ${PICKER_LIMIT + 60} chosen (at most ${PICKER_LIMIT})`
        );
        // the last page holds rows that are not chosen
        fireEvent.change(
            screen.getByRole('textbox', { name: 'Search by name' }),
            {
                target: { value: 't5' },
            }
        );
        const extra = `public.t${PICKER_LIMIT + 10}`;
        await userEvent.click(box(extra));
        // a single tick past the limit is not even reported
        expect(spy).not.toHaveBeenCalled();
        expect(box(extra)).not.toBeChecked();
        await userEvent.click(box('Choose everything on this page'));
        expect(spy.mock.lastCall![0].size).toBe(PICKER_LIMIT);
    });

    // BUG (minor): a row with no schema (MySQL, SQLite metadata) adds an
    // empty "" schema, which the schema list shows as a blank option with the
    // same value as "All schemas". It cannot be told apart from "All schemas"
    // and choosing it does not narrow the list to the rows without a schema.
    it.fails(
        'does not offer a blank schema option for rows without a schema',
        () => {
            show([row('', 'plain'), row('app', 'users')]);
            const options = within(
                screen.getByRole('combobox', { name: 'Schema' })
            ).getAllByRole('option');
            expect(options.map((o) => o.textContent)).not.toContain('');
        }
    );
});
