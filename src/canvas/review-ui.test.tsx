import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { shop } from './test/fixtures';
import { renderCanvas } from './test/render';
import { ARROW_COMMIT_MS } from './diagram-canvas';

const wrapper = (id: string) =>
    screen.getByTestId(`entity-${id}`).closest('.react-flow__node')!;

describe('review ui 2: arrow keys move a table and the move is saved', () => {
    it('five arrow presses become one edit, one undo step', async () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        act(() => store.getState().select([s.users]));
        const before = store.getState().design.entities.byId[s.users];
        for (let i = 0; i < 5; i++) {
            fireEvent.keyDown(wrapper(s.users), { key: 'ArrowRight' });
            fireEvent.keyUp(wrapper(s.users), { key: 'ArrowRight' });
        }
        await waitFor(
            () =>
                expect(
                    store.getState().design.entities.byId[s.users].x
                ).not.toBe(before.x),
            { timeout: ARROW_COMMIT_MS * 6 }
        );
        act(() => store.getState().undo());
        expect(store.getState().design.entities.byId[s.users].x).toBe(before.x);
    });
});

describe('review ui 3: Escape that a popover took does not close the table card', () => {
    it('a prevented Escape leaves the editing state alone', () => {
        const s = shop();
        const { store } = renderCanvas(s.design, {
            canvas: {
                hooks: {
                    renderEntityEditor: ({ entityId }) => (
                        <div data-testid="editor">{entityId}</div>
                    ),
                },
            },
        });
        fireEvent.doubleClick(screen.getByTestId(`entity-${s.users}`));
        expect(screen.getByTestId('editor')).toBeInTheDocument();
        const prevented = new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
        });
        prevented.preventDefault();
        act(() => {
            document.body.dispatchEvent(prevented);
        });
        expect(screen.queryByTestId('editor')).toBeInTheDocument();
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(screen.queryByTestId('editor')).toBeNull();
        expect(store).toBeDefined();
    });
});

describe('review ui 5: Delete is not for the canvas while a dialog has the focus', () => {
    it('keeps the selected tables when a button in a dialog gets Backspace', () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        act(() => store.getState().select([s.users, s.orders]));
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('data-state', 'open');
        const button = document.createElement('button');
        dialog.append(button);
        document.body.append(dialog);
        fireEvent.keyDown(button, { key: 'Backspace' });
        expect(store.getState().design.entities.byId[s.users]).toBeDefined();
        expect(store.getState().design.entities.byId[s.orders]).toBeDefined();
        // the same press on a plain page deletes them
        dialog.remove();
        fireEvent.keyDown(document.body, { key: 'Backspace' });
        expect(store.getState().design.entities.byId[s.users]).toBeUndefined();
    });

    it('skips Delete when a plain button outside any dialog has the focus', () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        act(() => store.getState().select([s.users]));
        const button = document.createElement('button');
        document.body.append(button);
        fireEvent.keyDown(button, { key: 'Delete' });
        expect(store.getState().design.entities.byId[s.users]).toBeDefined();
        button.remove();
    });
});

describe('review ui 7: header actions are reachable without a hover', () => {
    it('the buttons are in the page (not display:none) and drawn on focus and touch', () => {
        const s = shop();
        renderCanvas(s.design);
        const card = screen.getByTestId(`entity-${s.users}`);
        const button = card.querySelector('button[aria-label]')!;
        const group = button.parentElement!;
        expect(group.className).not.toMatch(/(^|\s)hidden(\s|$)/);
        expect(group.className).toContain('group-focus-within:opacity-100');
        expect(group.className).toContain('pointer-coarse:opacity-100');
    });
});

describe('review ui 13: field card on touch', () => {
    it('an emulated mouseenter right after a touch does not open the field card', async () => {
        const { design, orderUser } = shop();
        renderCanvas(design);
        const row = screen.getByTestId(`field-${orderUser}`);
        fireEvent.touchStart(row);
        fireEvent.mouseEnter(row);
        await new Promise((r) => setTimeout(r, 600));
        expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull();
    });
});
