import React from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { applyOk, withTables } from '@/core/testing/helpers';
import { renderPanel } from '@/features/testing/render-panel';
import { UserTypesSection } from '../user-types-section';
import { withEnumValue, withoutEnumValue } from '../user-type-list';

const types = (store: ReturnType<typeof renderPanel>['store']) => {
    const d = store.getState().design;
    return d.userTypes.order.map((id) => d.userTypes.byId[id]);
};

describe('EDT-188 EDT-189 the section and New Type', () => {
    it('shows the empty state, then adds type_1 as an empty enum', async () => {
        const { store } = renderPanel(<UserTypesSection />, withTables([]));
        expect(screen.getByText('No custom types')).toBeTruthy();
        expect(
            screen.getByText(
                'Custom types will appear here when they are available in your database'
            )
        ).toBeTruthy();
        await userEvent.click(
            screen.getAllByRole('button', { name: 'New Type' })[0]
        );
        expect(types(store)[0]).toMatchObject({
            name: 'type_1',
            kind: 'enum',
            values: [],
        });
    });

    it('filters by name and says when nothing matches', async () => {
        const design = applyOk(withTables([]), {
            type: 'item.insert',
            collection: 'userTypes',
            item: { id: 'a', name: 'mood', kind: 'enum', values: [] },
        }).design;
        renderPanel(<UserTypesSection />, design);
        await userEvent.type(screen.getByLabelText('Filter'), 'zzz');
        expect(
            screen.getByText('No custom types found matching your filter.')
        ).toBeTruthy();
    });
});

describe('EDT-190 renaming and deleting', () => {
    it('renames on Enter and deletes from the menu, undoably (EDT-199)', async () => {
        const { store } = renderPanel(<UserTypesSection />, withTables([]));
        await userEvent.click(
            screen.getAllByRole('button', { name: 'New Type' })[0]
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Rename type' })
        );
        const box = screen.getByRole('textbox', { name: 'Rename type' });
        await userEvent.clear(box);
        await userEvent.type(box, 'mood{Enter}');
        expect(types(store)[0].name).toBe('mood');
        await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
        await userEvent.click(
            await screen.findByRole('menuitem', { name: 'Delete Type' })
        );
        expect(types(store)).toHaveLength(0);
        store.getState().undo();
        expect(types(store)).toHaveLength(1);
    });
});

describe('EDT-191 to EDT-194 kind, values and members', () => {
    async function open() {
        const view = renderPanel(<UserTypesSection />, withTables([]));
        await userEvent.click(
            screen.getAllByRole('button', { name: 'New Type' })[0]
        );
        await userEvent.click(
            screen.getByRole('button', { name: /^Show or hide the details/ })
        );
        return view;
    }

    it('adds enum values with Enter and removes them as chips (EDT-192)', async () => {
        const { store } = await open();
        expect(screen.getByText('No enum values defined')).toBeTruthy();
        const box = screen.getByLabelText('Add enum value...');
        await userEvent.type(box, 'sad{Enter}ok{Enter}');
        expect(types(store)[0].values).toEqual(['sad', 'ok']);
        await userEvent.click(
            screen.getByRole('button', { name: 'Remove sad' })
        );
        expect(types(store)[0].values).toEqual(['ok']);
    });

    it('switching to composite clears the enum values (EDT-194)', async () => {
        const { store } = await open();
        await userEvent.type(
            screen.getByLabelText('Add enum value...'),
            'sad{Enter}'
        );
        await userEvent.click(screen.getByRole('combobox', { name: 'Kind' }));
        await userEvent.click(
            await screen.findByRole('option', { name: 'Composite' })
        );
        expect(types(store)[0]).toMatchObject({
            kind: 'composite',
            members: [],
        });
        expect(types(store)[0].values).toBeUndefined();
        expect(screen.getByText('No fields defined')).toBeTruthy();
    });

    it('adds and removes composite fields (EDT-193)', async () => {
        const { store } = await open();
        await userEvent.click(screen.getByRole('combobox', { name: 'Kind' }));
        await userEvent.click(
            await screen.findByRole('option', { name: 'Composite' })
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Add Field' })
        );
        expect(types(store)[0].members).toHaveLength(1);
        const row = screen.getByLabelText('Field name').closest('div')!;
        await userEvent.type(within(row).getByLabelText('Field name'), 'x');
        expect(types(store)[0].members?.[0].name).toBe('x');
        await userEvent.click(
            screen.getByRole('button', { name: 'Remove field' })
        );
        expect(types(store)[0].members).toEqual([]);
    });
});

describe('DB-006 alias types (SQL Server)', () => {
    const alias = () =>
        applyOk(withTables([]), {
            type: 'item.insert',
            collection: 'userTypes',
            item: {
                id: 'al',
                name: 'ssn_type',
                kind: 'alias',
                base: 'varchar(11)',
            },
        }).design;

    it('shows an alias as its own kind, with what it is made from', async () => {
        renderPanel(<UserTypesSection />, alias());
        expect(screen.getByText('Alias')).toBeTruthy();
        await userEvent.click(
            screen.getByRole('button', { name: /^Show or hide the details/ })
        );
        const base = screen.getByLabelText(
            'Based on (for example varchar(11))'
        ) as HTMLInputElement;
        expect(base.value).toBe('varchar(11)');
        // not the enum or composite editors
        expect(screen.queryByText('No enum values defined')).toBeNull();
        expect(screen.queryByText('No fields defined')).toBeNull();
    });

    it('changes what the alias is made from', async () => {
        const { store } = renderPanel(<UserTypesSection />, alias());
        await userEvent.click(
            screen.getByRole('button', { name: /^Show or hide the details/ })
        );
        const base = screen.getByLabelText(
            'Based on (for example varchar(11))'
        );
        await userEvent.clear(base);
        await userEvent.type(base, 'char(9)');
        expect(types(store)[0].base).toBe('char(9)');
    });

    it('switching an alias to enum drops its base', async () => {
        const { store } = renderPanel(<UserTypesSection />, alias());
        await userEvent.click(
            screen.getByRole('button', { name: /^Show or hide the details/ })
        );
        await userEvent.click(screen.getByRole('combobox', { name: 'Kind' }));
        await userEvent.click(
            await screen.findByRole('option', { name: 'Enum' })
        );
        expect(types(store)[0]).toMatchObject({ kind: 'enum', values: [] });
        expect(types(store)[0].base).toBeUndefined();
    });

    it('does not offer Alias as a kind to an enum', async () => {
        const view = renderPanel(<UserTypesSection />, withTables([]));
        await userEvent.click(
            screen.getAllByRole('button', { name: 'New Type' })[0]
        );
        await userEvent.click(
            screen.getByRole('button', { name: /^Show or hide the details/ })
        );
        await userEvent.click(screen.getByRole('combobox', { name: 'Kind' }));
        expect(
            await screen.findByRole('option', { name: 'Composite' })
        ).toBeTruthy();
        expect(screen.queryByRole('option', { name: 'Alias' })).toBeNull();
        expect(view.store.getState().design.userTypes.order).toHaveLength(1);
    });
});

describe('EDT-192 enum value rules', () => {
    it('refuses blank and repeated values', () => {
        expect(withEnumValue(['a'], '  ')).toBeUndefined();
        expect(withEnumValue(['a'], 'a')).toBeUndefined();
        expect(withEnumValue(['a'], ' b ')).toEqual(['a', 'b']);
        expect(withoutEnumValue(['a', 'b'], 'a')).toEqual(['b']);
    });
});

describe('EDT-196 Highlight Fields', () => {
    const typed = () =>
        applyOk(withTables([]), {
            type: 'item.insert',
            collection: 'userTypes',
            item: { id: 'a', name: 'mood', kind: 'enum', values: [] },
        }).design;

    it('Highlight Fields sets the one highlighted type, Clear Highlight clears it; nothing is undoable', async () => {
        const { store } = renderPanel(<UserTypesSection />, typed());
        await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
        await userEvent.click(
            await screen.findByRole('menuitem', { name: 'Highlight Fields' })
        );
        expect(store.getState().ui.highlightedTypeId).toBe('a');
        expect(store.getState().history.undo).toHaveLength(0);
        await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
        await userEvent.click(
            await screen.findByRole('menuitem', { name: 'Clear highlight' })
        );
        expect(store.getState().ui.highlightedTypeId).toBeUndefined();
    });
});
