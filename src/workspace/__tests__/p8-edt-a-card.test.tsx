import '@/canvas/test/setup';
import React from 'react';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shop } from '@/canvas/test/fixtures';
import { EditorFrame } from '../editor-frame';
import { renderInEditor } from './test-harness';

const mount = () => {
    const fixture = shop();
    const view = renderInEditor(
        <HelmetProvider>
            <EditorFrame />
        </HelmetProvider>,
        { design: fixture.design }
    );
    return { ...view, ...fixture };
};

const openCard = async (id: string, name: string) => {
    fireEvent.doubleClick(await screen.findByTestId(`entity-${id}`));
    return screen.findByRole('group', { name: `Edit table ${name}` });
};

const gone = (name: string) =>
    waitFor(
        () =>
            expect(
                screen.queryByRole('group', { name: `Edit table ${name}` })
            ).toBeNull(),
        { timeout: 4000 }
    );

afterEach(() => vi.useRealTimers());

describe('p8 EDT-088 to EDT-095, EDT-118 the edit card', () => {
    it('EDT-090: each field row has a name box, type picker, N toggle, PK toggle and attributes', async () => {
        const { users } = mount();
        const card = await openCard(users, 'users');
        expect(within(card).getByLabelText('Field name')).toBeTruthy();
        expect(within(card).getAllByRole('combobox').length).toBeGreaterThan(0);
        expect(
            within(card).getByRole('button', { name: 'Allow null' })
        ).toBeTruthy();
        expect(
            within(card).getByRole('button', { name: 'Primary key' })
        ).toBeTruthy();
        expect(
            within(card).getByRole('button', { name: 'Field attributes' })
        ).toBeTruthy();
    });

    it('EDT-091: a new field is focused and highlighted light blue', async () => {
        const { users } = mount();
        const card = await openCard(users, 'users');
        fireEvent.click(
            within(card).getAllByRole('button', { name: 'Add field' }).at(-1)!
        );
        await waitFor(() => {
            const last = within(card).getAllByLabelText('Field name').at(-1)!;
            expect(document.activeElement).toBe(last);
            expect(last.parentElement!.className).toContain('bg-sky-100');
        });
    });

    it('EDT-092: the card is shielded from canvas panning and wheel handling', async () => {
        const { users } = mount();
        const card = await openCard(users, 'users');
        const wrapper = card.closest('.nowheel');
        expect(wrapper).toBeTruthy();
        expect(wrapper!.className).toContain('nopan');
    });

    it('EDT-093: Escape and a click on the empty canvas close the card', async () => {
        const { users, container } = mount();
        await openCard(users, 'users');
        fireEvent.keyDown(document.body, { key: 'Escape' });
        await gone('users');
        await openCard(users, 'users');
        fireEvent.click(container.querySelector('.react-flow__pane')!);
        await gone('users');
    });

    it('EDT-093: starting a relationship closes the card', async () => {
        const { users, orders } = mount();
        await openCard(users, 'users');
        fireEvent.contextMenu(
            (await screen.findByTestId(`entity-${orders}`)).closest(
                '.react-flow__node'
            )!
        );
        fireEvent.click(
            within(screen.getByTestId('pointer-menu')).getByText(
                'Add relationship'
            )
        );
        await gone('users');
    });

    it('EDT-094: a table name saves one second after typing stops; empty names are ignored', async () => {
        const { users, store } = mount();
        const card = await openCard(users, 'users');
        const box = within(card).getByLabelText('Table name');
        const name = () => store.getState().design.entities.byId[users].name;
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        fireEvent.change(box, { target: { value: 'people' } });
        act(() => vi.advanceTimersByTime(900));
        expect(name()).toBe('users');
        act(() => vi.advanceTimersByTime(200));
        expect(name()).toBe('people');
        fireEvent.change(box, { target: { value: '  ' } });
        act(() => vi.advanceTimersByTime(1500));
        expect(name()).toBe('people');
    });

    it('EDT-118: a field name saves 0.3 s after typing stops; unchanged text is not saved', async () => {
        const { users, store } = mount();
        const card = await openCard(users, 'users');
        const box = within(card).getAllByLabelText('Field name')[0];
        const names = () => {
            const d = store.getState().design;
            return d.entities.byId[users].columnIds.map(
                (c) => d.columns[c].name
            );
        };
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        fireEvent.change(box, { target: { value: 'uid' } });
        act(() => vi.advanceTimersByTime(200));
        expect(names()).toEqual(['id']);
        act(() => vi.advanceTimersByTime(150));
        expect(names()).toEqual(['uid']);
        const history = store.getState().history;
        fireEvent.change(box, { target: { value: 'uid' } });
        act(() => vi.advanceTimersByTime(500));
        expect(store.getState().history).toBe(history);
    });
});
