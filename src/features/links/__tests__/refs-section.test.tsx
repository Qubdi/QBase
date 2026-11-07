import React from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { applyOk, rng, withTables } from '@/core/testing/helpers';
import { planLink } from '@/core/commands/plan-link';
import { resetToasts } from '@/platform/toast/use-toast';
import { renderPanel } from '@/features/testing/render-panel';
import { RefsSection } from '../refs-section';

function linked() {
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
    return {
        design: applyOk(base, plan.command).design,
        link: plan.link,
        users,
        orders,
    };
}

afterEach(() => resetToasts());

describe('EDT-182 an empty Refs list', () => {
    it('says No relationships', () => {
        renderPanel(<RefsSection />, withTables(['a']));
        expect(screen.getByText('No relationships')).toBeTruthy();
        expect(
            screen.getByText('Create a relationship to get started')
        ).toBeTruthy();
    });
});

describe('EDT-178 EDT-179 EDT-181 a relationship row', () => {
    it('opens to show both ends, changes cardinality, switches and deletes', async () => {
        const { design, link } = linked();
        const { store } = renderPanel(<RefsSection />, design);
        await userEvent.click(screen.getByRole('button', { name: link.name }));
        const row = screen.getByTestId('ref-row');
        expect(within(row).getByText('Primary table')).toBeTruthy();
        expect(within(row).getByText('Related table')).toBeTruthy();

        await userEvent.click(
            within(row).getByRole('combobox', { name: 'Cardinality' })
        );
        await userEvent.click(
            await screen.findByRole('option', { name: 'One to many' })
        );
        expect(store.getState().design.links.byId[link.id]).toMatchObject({
            sourceCardinality: 'one',
            targetCardinality: 'many',
        });

        await userEvent.click(
            within(row).getByRole('button', { name: 'Switch tables' })
        );
        expect(store.getState().design.links.byId[link.id].sourceEntityId).toBe(
            link.targetEntityId
        );

        await userEvent.click(
            within(row).getByRole('button', { name: 'Delete' })
        );
        expect(store.getState().design.links.order).toEqual([]);
        store.getState().undo();
        expect(store.getState().design.links.order).toEqual([link.id]);
    });

    it('collapse all closes open rows', async () => {
        const { design, link } = linked();
        renderPanel(<RefsSection />, design);
        await userEvent.click(screen.getByRole('button', { name: link.name }));
        expect(screen.getByText('Primary table')).toBeTruthy();
        await userEvent.click(
            screen.getByRole('button', { name: 'Collapse all' })
        );
        expect(screen.queryByText('Primary table')).toBeNull();
    });
});

describe('EDT-180 filtering the list', () => {
    it('matches table names and says when nothing matches', async () => {
        const { design } = linked();
        renderPanel(<RefsSection />, design);
        await userEvent.type(screen.getByLabelText('Filter'), 'order');
        expect(screen.getAllByTestId('ref-row')).toHaveLength(1);
        await userEvent.clear(screen.getByLabelText('Filter'));
        await userEvent.type(screen.getByLabelText('Filter'), 'zzz');
        expect(
            screen.getByText('No relationships found matching your filter.')
        ).toBeTruthy();
    });
});

describe('EDT-163 to EDT-168 the Create Relationship dialog', () => {
    async function openDialog(design = withTables(['users', 'orders'])) {
        const view = renderPanel(<RefsSection />, design);
        await userEvent.click(
            screen.getByRole('button', { name: 'Add relationship' })
        );
        return { ...view, dialog: await screen.findByRole('dialog') };
    }
    const pick = async (dialog: HTMLElement, label: string, option: string) => {
        await userEvent.click(
            within(dialog).getByRole('combobox', { name: label })
        );
        await userEvent.click(
            await screen.findByRole('option', { name: option })
        );
    };

    it('keeps Create disabled until all four are chosen, then creates users_id_fk, one to one', async () => {
        const { dialog, store } = await openDialog();
        const create = within(dialog).getByRole('button', { name: 'Create' });
        expect(create).toHaveProperty('disabled', true);
        await pick(dialog, 'Primary table', 'users');
        await pick(dialog, 'Primary field', 'id');
        await pick(dialog, 'Referenced table', 'orders');
        expect(create).toHaveProperty('disabled', true);
        await pick(dialog, 'Referenced field', 'id');
        expect(create).toHaveProperty('disabled', false);
        await userEvent.click(create);
        const links = store.getState().design.links;
        expect(links.order).toHaveLength(1);
        expect(links.byId[links.order[0]]).toMatchObject({
            name: 'users_id_fk',
            sourceCardinality: 'one',
            targetCardinality: 'one',
        });
        // the new row is open in the list (EDT-160)
        expect(await screen.findByText('Primary table')).toBeTruthy();
    });

    it('field picker waits for its table (EDT-164)', async () => {
        const { dialog } = await openDialog();
        expect(
            within(dialog).getByRole('combobox', { name: 'Primary field' })
        ).toHaveProperty('disabled', true);
    });

    it('refuses incompatible types with a notice and creates nothing (EDT-154)', async () => {
        const base = withTables(['users', 'orders']);
        const orders = base.entities.byId[base.entities.order[1]];
        const design = applyOk(base, {
            type: 'part.update',
            entityId: orders.id,
            part: 'columns',
            id: orders.columnIds[0],
            patch: { type: { id: 'text', name: 'text' } },
        }).design;
        const { dialog, store } = await openDialog(design);
        await pick(dialog, 'Primary table', 'users');
        await pick(dialog, 'Primary field', 'id');
        await pick(dialog, 'Referenced table', 'orders');
        await pick(dialog, 'Referenced field', 'id');
        await userEvent.click(
            within(dialog).getByRole('button', { name: 'Create' })
        );
        expect(store.getState().design.links.order).toEqual([]);
        expect(
            await screen.findByText('Field types are not compatible')
        ).toBeTruthy();
    });

    it('refuses a pair that is already connected (EDT-155, EDT-168)', async () => {
        const { design } = linked();
        const { dialog, store } = await openDialog(design);
        await pick(dialog, 'Primary table', 'orders');
        await pick(dialog, 'Primary field', 'id');
        await pick(dialog, 'Referenced table', 'users');
        await pick(dialog, 'Referenced field', 'id');
        await userEvent.click(
            within(dialog).getByRole('button', { name: 'Create' })
        );
        expect(store.getState().design.links.order).toHaveLength(1);
        expect(await screen.findByText('Already connected')).toBeTruthy();
    });

    it('says No tables found when there are none (EDT-165)', async () => {
        const { dialog } = await openDialog(withTables([]));
        expect(within(dialog).getAllByText('No tables found')).toHaveLength(2);
    });
});
