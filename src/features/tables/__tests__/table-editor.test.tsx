import React from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { applyOk, rng, withTables } from '@/core/testing/helpers';
import { planLink } from '@/core/commands/plan-link';
import { planAddRule } from '@/core/commands/plan-column';
import { renderPanel } from '@/features/testing/render-panel';
import { TablesSection } from '../tables-section';

async function openFirst(design = withTables(['orders'])) {
    const view = renderPanel(<TablesSection />, design);
    await userEvent.click(
        screen.getByRole('button', { name: /^Show or hide the details/ })
    );
    return view;
}

const first = (store: Awaited<ReturnType<typeof openFirst>>['store']) => {
    const d = store.getState().design;
    const entity = d.entities.byId[d.entities.order[0]];
    return { d, entity, columns: entity.columnIds.map((id) => d.columns[id]) };
};

describe('EDT-117 EDT-138 adding and deleting a field', () => {
    it('adds field_2 with the default type, nullable, at the end', async () => {
        const { store } = await openFirst();
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Add field' }).at(-1)!
        );
        const { columns } = first(store);
        expect(columns.map((c) => c.name)).toEqual(['id', 'field_2']);
        expect(columns[1]).toMatchObject({
            nullable: true,
            primaryKey: false,
            unique: false,
            type: { id: 'bigint' },
        });
    });

    it('deletes from the attributes popover and undo brings it back', async () => {
        const { store } = await openFirst();
        await userEvent.click(
            screen.getByRole('button', { name: 'Field attributes' })
        );
        await userEvent.click(
            await screen.findByRole('button', { name: 'Delete field' })
        );
        expect(first(store).columns).toHaveLength(0);
        store.getState().undo();
        expect(first(store).columns).toHaveLength(1);
    });
});

describe('EDT-118 renaming a field', () => {
    it('saves the typed name', async () => {
        const { store } = await openFirst();
        const box = screen.getByLabelText('Field name');
        await userEvent.clear(box);
        await userEvent.type(box, 'order_id');
        await userEvent.tab();
        expect(first(store).columns[0].name).toBe('order_id');
    });

    it('does not save an empty name', async () => {
        const { store } = await openFirst();
        const box = screen.getByLabelText('Field name');
        await userEvent.clear(box);
        await userEvent.tab();
        expect(first(store).columns[0].name).toBe('id');
    });
});

describe('EDT-133 EDT-134 the N and key toggles', () => {
    it('a key column is not nullable and its N toggle is disabled', async () => {
        await openFirst();
        expect(
            screen.getByRole('button', { name: 'Allow null' })
        ).toHaveProperty('disabled', true);
    });

    it('turning on the key makes the field not null, and the first key is unique', async () => {
        const { store } = await openFirst();
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Add field' }).at(-1)!
        );
        const keys = screen.getAllByRole('button', { name: 'Primary key' });
        await userEvent.click(keys[0]); // clear the first key
        await userEvent.click(keys[1]);
        const { columns, d, entity } = first(store);
        expect(columns[1]).toMatchObject({
            primaryKey: true,
            nullable: false,
            unique: true,
        });
        // the primary-key index follows (EDT-145)
        const pk = entity.keyIds.map((id) => d.keys[id]).find((k) => k.pk);
        expect(pk?.members).toEqual([columns[1].id]);
    });
});

describe('EDT-119 EDT-121 EDT-123 EDT-124 the type picker', () => {
    it('lists types, filters, and says when none match', async () => {
        await openFirst();
        await userEvent.click(screen.getByRole('combobox'));
        expect(await screen.findAllByRole('option')).not.toHaveLength(0);
        await userEvent.type(screen.getByLabelText('Search types'), 'zzzzz');
        expect(screen.getByText('No types found')).toBeTruthy();
    });

    it('picking varchar then typing varchar(30) sets the length', async () => {
        const { store } = await openFirst();
        await userEvent.click(screen.getByRole('combobox'));
        await userEvent.type(
            screen.getByLabelText('Search types'),
            'varchar(30)'
        );
        await userEvent.click(
            await screen.findByRole('option', { name: 'varchar(30)' })
        );
        expect(first(store).columns[0]).toMatchObject({
            type: { id: 'varchar' },
            length: 30,
        });
    });

    it('serial makes the field not null with auto increment', async () => {
        const { store } = await openFirst();
        await userEvent.click(screen.getByRole('combobox'));
        await userEvent.click(
            await screen.findByRole('option', { name: /^serial$/ })
        );
        expect(first(store).columns[0]).toMatchObject({
            nullable: false,
            increment: true,
        });
    });

    it('splits standard and custom types when the design has custom types (EDT-120)', async () => {
        const base = withTables(['orders']);
        const design = applyOk(base, {
            type: 'item.insert',
            collection: 'userTypes',
            item: {
                id: 'u',
                name: 'mood',
                kind: 'enum',
                values: ['sad', 'ok'],
            },
        }).design;
        await openFirst(design);
        await userEvent.click(screen.getByRole('combobox'));
        expect(await screen.findByText('Standard types')).toBeTruthy();
        expect(screen.getByText('Custom types')).toBeTruthy();
        expect(screen.getByText('sad | ok')).toBeTruthy();
    });
});

describe('EDT-125 to EDT-132 the attributes popover', () => {
    it('shows only what fits: Auto Increment for integers, Array on PostgreSQL', async () => {
        await openFirst();
        await userEvent.click(
            screen.getByRole('button', { name: 'Field attributes' })
        );
        const pop = await screen.findByLabelText('Field attributes', {
            selector: '[role=dialog]',
        });
        expect(within(pop).getByText('Auto increment')).toBeTruthy();
        expect(within(pop).getByText('Array')).toBeTruthy();
        expect(within(pop).queryByText('Max length')).toBeNull();
    });

    it('has no Array for MySQL', async () => {
        await openFirst(withTables(['orders'], 'mysql'));
        await userEvent.click(
            screen.getByRole('button', { name: 'Field attributes' })
        );
        const pop = await screen.findByLabelText('Field attributes', {
            selector: '[role=dialog]',
        });
        expect(within(pop).queryByText('Array')).toBeNull();
    });

    it('keeps the default value verbatim and an empty one clears it', async () => {
        const { store } = await openFirst();
        await userEvent.click(
            screen.getByRole('button', { name: 'Field attributes' })
        );
        const box = await screen.findByPlaceholderText('No default');
        await userEvent.type(box, "now() + '1 day'");
        await userEvent.tab();
        expect(first(store).columns[0].default).toBe("now() + '1 day'");
        await userEvent.clear(box);
        await userEvent.tab();
        expect(first(store).columns[0].default).toBeUndefined();
    });

    it('a description shows a comment icon beside the name (EDT-132)', async () => {
        const { store } = await openFirst();
        await userEvent.click(
            screen.getByRole('button', { name: 'Field attributes' })
        );
        const pop = await screen.findByRole('dialog');
        await userEvent.type(
            within(pop).getByPlaceholderText('No description'),
            'who'
        );
        await userEvent.tab();
        expect(first(store).columns[0].comments).toBe('who');
        expect(
            await screen.findByRole('button', {
                name: 'Show field description',
            })
        ).toBeTruthy();
    });
});

describe('EDT-140 to EDT-146 indexes', () => {
    it('lists the primary-key index first, labelled, with no field editing', async () => {
        const { store } = await openFirst();
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Add index' }).at(-1)!
        );
        const rows = screen.getAllByTestId(/index-row|primary-key-index/);
        expect(rows[0].getAttribute('data-testid')).toBe('primary-key-index');
        expect(within(rows[0]).getByText('Primary key')).toBeTruthy();
        expect(
            within(rows[0]).getByRole('button', { name: 'Select fields' })
        ).toHaveProperty('disabled', true);
        const { d, entity } = first(store);
        const added = entity.keyIds.map((id) => d.keys[id]).find((k) => !k.pk)!;
        expect(added).toMatchObject({
            label: 'index_2',
            distinct: false,
            algorithm: 'btree',
        });
    });

    it('chooses fields and toggles Unique', async () => {
        const { store } = await openFirst();
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Add index' }).at(-1)!
        );
        const row = screen.getAllByTestId('index-row')[0];
        await userEvent.click(
            within(row).getByRole('button', { name: 'Select fields' })
        );
        await userEvent.click(await screen.findByRole('checkbox'));
        await userEvent.keyboard('{Escape}');
        await userEvent.click(
            within(row).getByRole('button', { name: 'Unique' })
        );
        const { d, entity, columns } = first(store);
        const added = entity.keyIds.map((id) => d.keys[id]).find((k) => !k.pk)!;
        expect(added.members).toEqual([columns[0].id]);
        expect(added.distinct).toBe(true);
    });

    it('indexes and checks are not offered for a view (EDT-140, EDT-147)', async () => {
        const base = withTables(['orders']);
        const id = base.entities.order[0];
        const design = applyOk(base, {
            type: 'entity.update',
            id,
            patch: { kind: 'view' },
        }).design;
        renderPanel(<TablesSection />, design, { filter: {}, showViews: true });
        await userEvent.click(
            screen.getByRole('button', { name: /^Show or hide the details/ })
        );
        expect(screen.queryByText('Indexes')).toBeNull();
        expect(screen.queryByText('Check constraints')).toBeNull();
        expect(screen.getByText('Fields')).toBeTruthy();
    });
});

describe('EDT-147 to EDT-151 check constraints', () => {
    it('adds a check, saves its expression and deletes it', async () => {
        const { store } = await openFirst();
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Add check' }).at(-1)!
        );
        const box = screen.getByPlaceholderText('e.g. price > 0');
        await userEvent.type(box, 'id > 0');
        await userEvent.tab();
        const rule = () => {
            const { d, entity } = first(store);
            return entity.ruleIds.map((id) => d.rules[id]);
        };
        expect(rule()[0].expression).toBe('id > 0');
        await userEvent.click(
            screen.getByRole('button', { name: 'Check constraint' })
        );
        await userEvent.click(
            await screen.findByRole('button', {
                name: 'Delete check constraint',
            })
        );
        expect(rule()).toHaveLength(0);
        store.getState().undo();
        expect(rule()).toHaveLength(1);
    });
});

describe('EDT-098 the description of a table', () => {
    it('saves as it is typed', async () => {
        const { store } = await openFirst();
        await userEvent.type(
            screen.getByPlaceholderText('No description'),
            'orders placed'
        );
        await userEvent.tab();
        expect(first(store).entity.comments).toBe('orders placed');
    });
});

describe('EDT-150 check constraints where SQL export leaves them out', () => {
    const openOnly = (withCheck: boolean) => {
        let design = withTables(['orders']);
        const id = design.entities.order[0];
        if (withCheck) design = applyOk(design, planAddRule(id)).design;
        return { ...design, databaseType: 'clickhouse' as const };
    };

    it('hides the section when the table has none', async () => {
        renderPanel(<TablesSection />, openOnly(false));
        await userEvent.click(
            screen.getByRole('button', { name: /^Show or hide the details/ })
        );
        expect(screen.queryByText('Check constraints')).toBeNull();
    });

    it('warns and offers no Add button when the table has some', async () => {
        renderPanel(<TablesSection />, openOnly(true));
        await userEvent.click(
            screen.getByRole('button', { name: /^Show or hide the details/ })
        );
        expect(screen.getByText('Check constraints')).toBeTruthy();
        expect(screen.getByRole('note').textContent).toMatch(/leaves check/);
        expect(screen.queryByRole('button', { name: 'Add check' })).toBeNull();
    });

    it('stays as before for a database that writes checks', async () => {
        const { store } = await openFirst();
        expect(store.getState().design.databaseType).not.toBe('clickhouse');
        expect(
            screen.getAllByRole('button', { name: 'Add check' }).length
        ).toBeGreaterThan(0);
    });
});

describe('EDT-139 deleting a field that has a relationship', () => {
    it('removes the relationship with it, says so, and undo brings both back', async () => {
        const base = withTables(['users', 'orders']);
        const [users, orders] = base.entities.order.map(
            (id) => base.entities.byId[id]
        );
        const plan = planLink(
            base,
            { entityId: users.id, columnId: users.columnIds[0] },
            { entityId: orders.id, columnId: orders.columnIds[0] },
            { random: rng(4) }
        );
        if (plan.kind !== 'ok') throw new Error('no link');
        const design = applyOk(base, plan.command).design;
        const { store } = renderPanel(<TablesSection />, design);
        await userEvent.click(
            screen.getAllByRole('button', {
                name: /^Show or hide the details/,
            })[0]
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Field attributes' })
        );
        await userEvent.click(
            await screen.findByRole('button', { name: 'Delete field' })
        );
        expect(store.getState().design.links.order).toHaveLength(0);
        expect(
            await screen.findByText(/Relationships removed with the field: 1/)
        ).toBeTruthy();
        store.getState().undo();
        expect(store.getState().design.links.order).toHaveLength(1);
    });
});
