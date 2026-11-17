import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { withTables } from '@/core/testing/helpers';
import { renderPanel } from '@/features/testing/render-panel';
import { TablesSection } from '../tables-section';

// Carrying a table past the others: the whole card moves, as a whole row does for
// the fields of a table, so the tables it passes make room live and none is cut off
// by the card's own edge. (The look of the drag itself is checked in a real browser;
// here the keyboard picks a table up, which needs no layout.)

const cards = () => screen.getAllByTestId('table-row');
const handles = () =>
    screen.getAllByRole('button', { name: 'Drag to reorder' });
const pickUp = async (index = 0) => {
    handles()[index].focus();
    await userEvent.keyboard(' ');
};

describe('carrying a table in the side panel', () => {
    it('lifts the whole card, not just its header strip', async () => {
        renderPanel(
            <TablesSection />,
            withTables(['orders', 'items', 'users'])
        );
        await pickUp(0);
        const card = cards()[0];
        // the card is the moving element: it floats above the others, with a shadow
        expect(card.className).toContain('opacity-80');
        expect(card.className).toContain('z-10');
        expect(card.className).toContain('shadow-md');
        // the header strip inside it is not what moves (it would be clipped by the card)
        expect(card.querySelector('.group')?.className).not.toContain(
            'opacity-80'
        );
        // the others stay as they are
        expect(cards()[1].className).not.toContain('opacity-80');
        expect(cards()[2].className).not.toContain('opacity-80');
    });

    it('puts the card down again when the drag is cancelled', async () => {
        renderPanel(
            <TablesSection />,
            withTables(['orders', 'items', 'users'])
        );
        await pickUp(1);
        expect(cards()[1].className).toContain('opacity-80');
        await userEvent.keyboard('{Escape}');
        expect(cards()[1].className).not.toContain('opacity-80');
        expect(cards()[1].className).not.toContain('shadow-md');
    });

    it('keeps the handle inside the card, after the expand arrow, where it always was', () => {
        renderPanel(<TablesSection />, withTables(['orders']));
        const card = cards()[0];
        const strip = card.querySelector('.group') as HTMLElement;
        const kids = [...strip.children];
        const arrow = kids.findIndex(
            (el) => el.getAttribute('aria-expanded') !== null
        );
        const grip = kids.findIndex(
            (el) => el.getAttribute('aria-label') === 'Drag to reorder'
        );
        expect(arrow).toBe(0);
        expect(grip).toBe(1);
        expect(card.contains(handles()[0])).toBe(true);
    });

    it('has no handle, and nothing to carry, in a read-only diagram', () => {
        renderPanel(<TablesSection />, withTables(['orders', 'items']), {
            readonly: true,
        });
        expect(
            screen.queryByRole('button', { name: 'Drag to reorder' })
        ).toBeNull();
    });

    describe('a table that is open', () => {
        const toggle = (name: string) =>
            screen.getByRole('button', {
                name: `Show or hide the details: ${name}`,
            });

        it('folds up while it is carried, and opens again when the drag ends', async () => {
            renderPanel(<TablesSection />, withTables(['orders', 'items']));
            await userEvent.click(toggle('orders'));
            expect(toggle('orders').getAttribute('aria-expanded')).toBe('true');
            // the form is on screen: it has the Add Field buttons of its fields
            const formButtons = () =>
                screen.queryAllByRole('button', { name: 'Add Field' });
            expect(formButtons().length).toBeGreaterThan(0);

            await pickUp(0);
            expect(toggle('orders').getAttribute('aria-expanded')).toBe(
                'false'
            );
            expect(formButtons()).toHaveLength(0);

            await userEvent.keyboard('{Escape}');
            expect(toggle('orders').getAttribute('aria-expanded')).toBe('true');
            expect(formButtons().length).toBeGreaterThan(0);
        });

        it('leaves another open table open while a different one is carried', async () => {
            renderPanel(<TablesSection />, withTables(['orders', 'items']));
            await userEvent.click(toggle('orders'));
            await pickUp(handles().length - 1); // the last handle is the other table's
            expect(toggle('orders').getAttribute('aria-expanded')).toBe('true');
            await userEvent.keyboard('{Escape}');
            expect(toggle('orders').getAttribute('aria-expanded')).toBe('true');
        });

        it('does not open a table that was closed when the drag started', async () => {
            renderPanel(<TablesSection />, withTables(['orders', 'items']));
            await pickUp(0);
            await userEvent.keyboard('{Escape}');
            expect(toggle('orders').getAttribute('aria-expanded')).toBe(
                'false'
            );
            expect(toggle('items').getAttribute('aria-expanded')).toBe('false');
        });
    });
});
