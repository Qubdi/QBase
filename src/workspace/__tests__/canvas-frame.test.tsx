import '@/canvas/test/setup';
import React, { useEffect } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { describe, expect, it } from 'vitest';
import { shop } from '@/canvas/test/fixtures';
import { useCanvasActions } from '../canvas-bridge-context';
import { EditorFrame } from '../editor-frame';
import { renderInEditor } from './test-harness';

const held: { actions?: ReturnType<typeof useCanvasActions> } = {};
const actions = () => held.actions!;
const Probe = () => {
    const current = useCanvasActions();
    useEffect(() => {
        held.actions = current;
    }, [current]);
    return null;
};

const mount = () => {
    const fixture = shop();
    const view = renderInEditor(
        <HelmetProvider>
            <EditorFrame />
            <Probe />
        </HelmetProvider>,
        { design: fixture.design }
    );
    return { ...view, ...fixture };
};

const transformOf = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('.react-flow__viewport')?.style
        .transform;

describe('the canvas in the editor frame (EDT-011, EDT-012)', () => {
    it('EDT-011: the tables of the design are drawn on the canvas', async () => {
        const { users, orders } = mount();
        expect(await screen.findByTestId(`entity-${users}`)).toBeTruthy();
        expect(screen.getByTestId(`entity-${orders}`)).toBeTruthy();
    });

    it('EDT-084: a double-click on a table opens the form in place of the card', async () => {
        const { users } = mount();
        fireEvent.doubleClick(await screen.findByTestId(`entity-${users}`));
        expect(
            await screen.findByRole('group', { name: 'Edit table users' })
        ).toBeTruthy();
        expect(screen.queryByTestId(`entity-${users}`)).toBeNull();
    });

    it('EDT-117: adding a field in the form is one undoable edit', async () => {
        const { users, store } = mount();
        fireEvent.doubleClick(await screen.findByTestId(`entity-${users}`));
        const form = await screen.findByRole('group', {
            name: 'Edit table users',
        });
        const columns = () =>
            store.getState().design.entities.byId[users].columnIds.length;
        const before = columns();
        fireEvent.click(
            within(form).getAllByRole('button', { name: 'Add field' })[0]
        );
        expect(columns()).toBe(before + 1);
        store.getState().undo();
        expect(columns()).toBe(before);
    });

    it('EDT-042: the Filter button opens the Filter Tables panel, and Ctrl+F toggles it', async () => {
        mount();
        const button = await screen.findByRole('button', {
            name: /Filter Tables/,
        });
        fireEvent.click(button);
        expect(
            await screen.findByRole('dialog', { name: 'Filter tables' })
        ).toBeTruthy();
        fireEvent.keyDown(document.body, { key: 'f', ctrlKey: true });
        await waitFor(() =>
            expect(
                screen.queryByRole('dialog', { name: 'Filter tables' })
            ).toBeNull()
        );
    });

    it('EDT-023: Show All moves the camera, from the toolbar and from the workspace', async () => {
        const { container } = mount();
        await screen.findByRole('button', { name: /Show All/ });
        const start = transformOf(container);
        fireEvent.click(screen.getAllByRole('button', { name: /Show All/ })[0]);
        await waitFor(() => expect(transformOf(container)).not.toBe(start), {
            timeout: 3000,
        });
        const moved = transformOf(container);
        fireEvent.wheel(container.querySelector('.react-flow__pane')!, {
            deltaX: 200,
            deltaY: 200,
        });
        actions().fitAll();
        await waitFor(() => expect(transformOf(container)).toBe(moved), {
            timeout: 3000,
        });
    });

    it('EXP-010: image export finds the canvas as its capture target', async () => {
        const { container, users } = mount();
        await screen.findByTestId(`entity-${users}`);
        const target = actions().captureTarget();
        expect(target?.getAttribute('data-slot')).toBe('canvas');
        expect(target?.querySelector('.react-flow__viewport')).toBeTruthy();
        expect(target?.querySelectorAll('.react-flow__node').length).toBe(3);
        expect(container.contains(target)).toBe(true);
    });
});
