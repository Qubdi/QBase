import React from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { withTables } from '@/core/testing/helpers';
import type { DatabaseType } from '@/core/model/database';
import { renderPanel } from '@/features/testing/render-panel';
import { TablesSection } from '../tables-section';

async function withIndexPopover(type: DatabaseType) {
    const view = renderPanel(<TablesSection />, withTables(['orders'], type));
    await userEvent.click(
        screen.getByRole('button', { name: /^Show or hide the details/ })
    );
    await userEvent.click(
        screen.getAllByRole('button', { name: 'Add index' }).at(-1)!
    );
    await userEvent.click(
        screen.getAllByRole('button', { name: 'Index attributes' }).at(-1)!
    );
    return view;
}

describe('EDT-142 the Index Attributes popover', () => {
    it('has Name, Unique, Index Type, a description and Delete', async () => {
        const { store } = await withIndexPopover('postgresql');
        const name = await screen.findByRole('textbox', { name: 'Name' });
        const pop = name.closest('[role="dialog"]') as HTMLElement;
        expect(within(pop).getByText('Unique')).toBeTruthy();
        expect(
            within(pop).getByRole('combobox', { name: 'Index type' })
        ).toBeTruthy();
        expect(
            within(pop).getByRole('textbox', { name: 'Description' })
        ).toBeTruthy();
        await userEvent.click(
            within(pop).getByRole('button', { name: 'Delete index' })
        );
        const d = store.getState().design;
        const entity = d.entities.byId[d.entities.order[0]];
        expect(
            entity.keyIds.map((id) => d.keys[id]).filter((k) => !k.pk)
        ).toEqual([]);
        store.getState().undo();
        const back = store.getState().design;
        expect(back.entities.byId[back.entities.order[0]].keyIds).toHaveLength(
            2
        );
    });
});

describe('EDT-143 Index Type only where the database has a choice', () => {
    it('is offered on CockroachDB', async () => {
        await withIndexPopover('cockroachdb');
        expect(
            await screen.findByRole('combobox', { name: 'Index type' })
        ).toBeTruthy();
    });

    it.each(['mysql', 'sql_server', 'sqlite', 'mariadb'] as const)(
        'is not offered on %s',
        async (type) => {
            await withIndexPopover(type);
            expect(
                await screen.findByRole('textbox', { name: 'Name' })
            ).toBeTruthy();
            expect(
                screen.queryByRole('combobox', { name: 'Index type' })
            ).toBeNull();
        }
    );
});
