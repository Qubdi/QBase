import React from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { designToDiagram, diagramToDesign } from '@/qbase/diagram-convert';
import { metadataToDiagram } from '@/lib/qubdi/import-from-db';
import postgresSample from '@/lib/qubdi/__tests__/fixtures/postgres-sample.json';
import { resetToasts } from '@/platform/toast/use-toast';
import { Toaster } from '@/platform/toast/toaster';
import { createEditorStore } from '@/store/editor-store';
import { StoreContext } from '@/store/store-context';
import { LintControl } from '../lint-control';

vi.mock('@/hooks/use-qubdi', () => ({
    useQubdi: () => ({ remoteIdFor: () => undefined, user: null }),
}));

const setup = async () => {
    const diagram = await metadataToDiagram('postgresql', postgresSample, 'x');
    const store = createEditorStore({
        design: diagramToDesign(diagram).design,
    });
    const view = render(
        <StoreContext.Provider value={store}>
            <LintControl />
            <Toaster />
        </StoreContext.Provider>
    );
    return { store, ...view };
};

const orders = (store: Awaited<ReturnType<typeof setup>>['store']) =>
    designToDiagram(store.getState().design).tables!.find(
        (t) => t.name === 'orders'
    )!;

beforeEach(() => resetToasts());

describe('QBS-028 lint button, count badge, and fixes through undoable editor operations', () => {
    it('shows the finding count on the button and lists the finding in a panel', async () => {
        await setup();
        expect(screen.getByTestId('lint-badge')).toHaveTextContent('1');
        fireEvent.click(screen.getByRole('button', { name: /^Lint/ }));
        expect(screen.getByRole('button', { name: 'Fix' })).toBeInTheDocument();
        expect(screen.getByTitle('Show on the canvas')).toBeInTheDocument();
    });

    it('Fix adds the index through the editor, the badge goes away, and Undo brings the finding back', async () => {
        const { store } = await setup();
        const before = orders(store).indexes.length;
        fireEvent.click(screen.getByRole('button', { name: /^Lint/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Fix' }));
        await waitFor(() =>
            expect(orders(store).indexes.length).toBe(before + 1)
        );
        expect(store.getState().history.undo).toHaveLength(1);
        await waitFor(() =>
            expect(screen.queryByTestId('lint-badge')).toBeNull()
        );
        act(() => store.getState().undo());
        expect(orders(store).indexes.length).toBe(before);
        await waitFor(() =>
            expect(screen.getByTestId('lint-badge')).toHaveTextContent('1')
        );
    });
});
