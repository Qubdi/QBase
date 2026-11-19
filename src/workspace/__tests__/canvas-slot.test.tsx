import '@/canvas/test/setup';
import React from 'react';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { apply } from '@/core/commands/apply';
import { NOW } from '@/core/testing/helpers';
import { shop } from '@/canvas/test/fixtures';
import { CanvasSlot } from '../canvas-slot';
import { renderInEditor } from './test-harness';

const mount = (design = shop().design) =>
    renderInEditor(<CanvasSlot />, { design });

/** The shop design with an enum type `mood`, used by orders.user_id. */
const withType = () => {
    const s = shop();
    const added = apply(
        s.design,
        {
            type: 'item.insert',
            collection: 'userTypes',
            item: { id: 'ut1', name: 'mood', kind: 'enum', values: [] },
        },
        { now: NOW }
    );
    if (!added.ok) throw new Error('no type');
    return { ...s, design: added.design };
};

describe('CanvasSlot', () => {
    it('shows a loading line while the diagram is read', () => {
        const { container } = renderInEditor(<CanvasSlot />, null);
        expect(screen.getByText('Loading the diagram...')).toBeInTheDocument();
        expect(container.querySelector('[data-slot="canvas"]')).not.toBeNull();
        expect(container.querySelector('.react-flow')).toBeNull();
    });

    it('draws the tables of the open diagram', async () => {
        const s = shop();
        mount(s.design);
        expect(
            await screen.findByTestId(`entity-${s.users}`)
        ).toBeInTheDocument();
        expect(screen.queryByText('Loading the diagram...')).toBeNull();
    });

    it('New Relationship on the pane menu opens the Create Relationship dialog, which closes again', async () => {
        const { container } = mount();
        await screen.findAllByTestId(/^entity-/);
        fireEvent.contextMenu(container.querySelector('.react-flow__pane')!);
        fireEvent.click(
            within(screen.getByTestId('pointer-menu')).getByText(
                'New Relationship'
            )
        );
        const dialog = await screen.findByRole('dialog', {
            name: 'Create Relationship',
        });
        fireEvent.keyDown(dialog, { key: 'Escape' });
        await waitFor(() =>
            expect(
                screen.queryByRole('dialog', { name: 'Create Relationship' })
            ).toBeNull()
        );
    });

    it('"Open in side panel" on a line selects it and shows the Refs section', async () => {
        const s = shop();
        const { store } = mount(s.design);
        act(() => store.getState().select([s.link]));
        fireEvent.click(await screen.findByTestId(`link-dot-${s.link}`));
        fireEvent.click(screen.getByLabelText('Open in side panel'));
        expect(store.getState().ui.selection).toEqual([s.link]);
        expect(store.getState().ui.panel.section).toBe('refs');
    });

    it('shows the custom type being highlighted, and a click on it clears the highlight', async () => {
        const { design } = withType();
        const { store } = mount(design);
        await screen.findAllByTestId(/^entity-/);
        expect(screen.queryByLabelText(/Highlighting/)).toBeNull();
        act(() => store.getState().setHighlightedType('ut1'));
        const chip = screen.getByLabelText(
            'Highlighting "mood" - click to clear'
        );
        fireEvent.click(chip);
        expect(store.getState().ui.highlightedTypeId).toBeUndefined();
        expect(screen.queryByLabelText(/Highlighting/)).toBeNull();
    });

    it('shows no highlight for a type that is not in the diagram', async () => {
        const { store } = mount();
        await screen.findAllByTestId(/^entity-/);
        act(() => store.getState().setHighlightedType('missing'));
        expect(screen.queryByLabelText(/Highlighting/)).toBeNull();
    });

    it('the Search & Filter panel opens from the canvas, zooms to a group and closes with its button', async () => {
        mount();
        fireEvent.click(
            await screen.findByRole('button', { name: /Search & Filter/ })
        );
        const panel = await screen.findByRole('dialog', {
            name: 'Search & Filter',
        });
        // zooming to a group is handed to the canvas, and leaves the panel open
        const zoom = within(panel).getAllByRole('button', { name: /^Zoom to/ });
        expect(zoom.length).toBeGreaterThan(0);
        fireEvent.click(zoom[0]);
        expect(
            screen.getByRole('dialog', { name: 'Search & Filter' })
        ).toBeInTheDocument();
        fireEvent.click(within(panel).getByRole('button', { name: 'Close' }));
        await waitFor(() =>
            expect(
                screen.queryByRole('dialog', { name: 'Search & Filter' })
            ).toBeNull()
        );
    });
});
