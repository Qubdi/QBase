import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { shop } from '@/canvas/test/fixtures';
import type { Design } from '@/core/model/design';
import type { Id } from '@/core/model/id';
import { createEditorStore } from '@/store/editor-store';
import { StoreContext } from '@/store/store-context';
import { QuickLinkCard } from '../quick-link-card';

const mount = (design: Design, source: Id, target: Id) => {
    const store = createEditorStore({ design });
    const done = vi.fn();
    const view = render(
        <StoreContext.Provider value={store}>
            <QuickLinkCard
                sourceEntityId={source}
                targetEntityId={target}
                anchor={{ x: 120, y: 80 }}
                done={done}
            />
        </StoreContext.Provider>
    );
    return { ...view, store, done };
};

/** The shop design with one column changed. */
const withColumn = (
    design: Design,
    id: Id,
    patch: Partial<Design['columns'][string]>
): Design => ({
    ...design,
    columns: { ...design.columns, [id]: { ...design.columns[id], ...patch } },
});

const card = () => screen.getByRole('dialog', { name: 'New relationship' });
const create = () => screen.getByRole('button', { name: 'Create' });
const firstColumn = (design: Design, entity: Id) =>
    design.entities.byId[entity].columnIds[0];

describe('QuickLinkCard (EDT-158 to EDT-162)', () => {
    it('names the key it starts from and suggests the first field that fits', () => {
        const s = shop();
        mount(s.design, s.users, s.items);
        expect(card()).toHaveTextContent('From users.id');
        expect(
            screen.getByRole('combobox', { name: 'Field in items' })
        ).toHaveTextContent('id');
        // an existing field is suggested, so there is no name box
        expect(
            screen.queryByRole('textbox', { name: 'New field name' })
        ).toBeNull();
    });

    it('is placed at the pointer', () => {
        const s = shop();
        mount(s.design, s.users, s.items);
        expect(card().style.left).toBe('120px');
        expect(card().style.top).toBe('80px');
    });

    it('Create links to the suggested field, selects the new line and closes with its id', async () => {
        const s = shop();
        const { store, done } = mount(s.design, s.users, s.items);
        const links = store.getState().design.links.order.length;
        await userEvent.click(create());
        const design = store.getState().design;
        expect(design.links.order).toHaveLength(links + 1);
        const id = design.links.order.at(-1)!;
        expect(done).toHaveBeenCalledWith(id);
        expect(store.getState().ui.selection).toEqual([id]);
    });

    it('suggests a new field named after the source when no field fits, and creates it with the link as one undo step', async () => {
        const s = shop();
        const design = withColumn(s.design, firstColumn(s.design, s.items), {
            type: { id: 'text', name: 'text' },
        });
        const { store, done } = mount(design, s.users, s.items);
        const name = screen.getByRole('textbox', { name: 'New field name' });
        expect(name).toHaveValue('users_id');
        await userEvent.clear(name);
        await userEvent.type(name, 'owner_id');
        await userEvent.click(create());
        const after = store.getState().design;
        const items = after.entities.byId[s.items];
        expect(items.columnIds.map((c) => after.columns[c].name)).toContain(
            'owner_id'
        );
        expect(done).toHaveBeenCalledWith(after.links.order.at(-1));
        store.getState().undo();
        const undone = store.getState().design;
        expect(undone.entities.byId[s.items].columnIds).toHaveLength(1);
        expect(undone.links.order).toHaveLength(s.design.links.order.length);
    });

    it('switching to "New field" shows the name box, and an empty name is refused with a message', async () => {
        const s = shop();
        const { store, done } = mount(s.design, s.users, s.items);
        await userEvent.click(
            screen.getByRole('combobox', { name: 'Field in items' })
        );
        await userEvent.click(
            await screen.findByRole('option', { name: 'New field' })
        );
        const name = screen.getByRole('textbox', { name: 'New field name' });
        expect(name).toHaveValue('');
        await userEvent.click(create());
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Choose a field, or give the new field a name.'
        );
        expect(done).not.toHaveBeenCalled();
        expect(store.getState().design.links.order).toHaveLength(
            s.design.links.order.length
        );
    });

    it('says the first table has no key when it has no primary key', async () => {
        const s = shop();
        const design = withColumn(s.design, s.userKey, { primaryKey: false });
        const { done } = mount(design, s.users, s.items);
        // nothing to start from: no "From" line, and the new field is offered
        expect(card()).not.toHaveTextContent('From');
        await userEvent.type(
            screen.getByRole('textbox', { name: 'New field name' }),
            'x_id'
        );
        await userEvent.click(create());
        expect(screen.getByRole('alert')).toHaveTextContent(
            'The first table has no primary key to start from.'
        );
        expect(done).not.toHaveBeenCalled();
    });

    it('says the fields cannot be connected when the picked field has a type that does not fit', async () => {
        const s = shop();
        const design = withColumn(s.design, firstColumn(s.design, s.items), {
            type: { id: 'text', name: 'text' },
        });
        const { store, done } = mount(design, s.users, s.items);
        await userEvent.click(
            screen.getByRole('combobox', { name: 'Field in items' })
        );
        await userEvent.click(
            await screen.findByRole('option', { name: 'id' })
        );
        await userEvent.click(create());
        expect(screen.getByRole('alert')).toHaveTextContent(
            'These fields cannot be connected.'
        );
        expect(done).not.toHaveBeenCalled();
        expect(store.getState().design.links.order).toHaveLength(
            design.links.order.length
        );
    });

    it('picking a field that is already linked hands back the existing line', async () => {
        const s = shop();
        const { store, done } = mount(s.design, s.users, s.orders);
        await userEvent.click(
            screen.getByRole('combobox', { name: 'Field in orders' })
        );
        await userEvent.click(
            await screen.findByRole('option', { name: 'user_id' })
        );
        await userEvent.click(create());
        expect(done).toHaveBeenCalledWith(s.link);
        expect(store.getState().design.links.order).toHaveLength(
            s.design.links.order.length
        );
    });

    it('Cancel closes without a link and changes nothing', async () => {
        const s = shop();
        const { store, done } = mount(s.design, s.users, s.items);
        const before = store.getState().design;
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(done).toHaveBeenCalledWith();
        expect(store.getState().design).toBe(before);
    });

    it('Escape closes it, unless an open dropdown took the key', () => {
        const s = shop();
        const { done } = mount(s.design, s.users, s.items);
        const listbox = document.createElement('div');
        listbox.setAttribute('role', 'listbox');
        document.body.appendChild(listbox);
        fireEvent.keyDown(listbox, { key: 'Escape' });
        expect(done).not.toHaveBeenCalled();
        listbox.remove();
        fireEvent.keyDown(document.body, { key: 'Enter' });
        expect(done).not.toHaveBeenCalled();
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(done).toHaveBeenCalledWith();
    });

    it('stops listening for Escape once it is gone', () => {
        const s = shop();
        const { done, unmount } = mount(s.design, s.users, s.items);
        unmount();
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(done).not.toHaveBeenCalled();
    });

    it('draws nothing when one of the tables is gone', () => {
        const s = shop();
        const { container } = mount(s.design, s.users, 'no-such-table');
        expect(container).toBeEmptyDOMElement();
    });
});
