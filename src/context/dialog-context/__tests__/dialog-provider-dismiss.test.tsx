import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/qubdi/workspace-context', () => ({
    useWorkspace: () => ({
        project: { id: 'p1', name: 'P', slug: 'p', role: 'editor' },
    }),
}));
vi.mock('@/qbase/storage-context', () => ({ useStorageAdapter: () => ({}) }));
vi.mock('@/store/store-context', () => ({
    useOptionalEditorStoreApi: () => null,
}));
vi.mock('@/workspace/canvas-bridge-context', () => ({
    useCanvasActions: () => ({}),
}));
vi.mock('@/platform/theme/theme-context', () => ({
    useTheme: () => ({ resolvedTheme: 'light' }),
}));
vi.mock('@/components/qubdi/project-open-dialog', () => ({
    ProjectOpenDialog: (p: { canClose?: boolean; onClose: () => void }) => (
        <button data-can-close={String(p.canClose)} onClick={p.onClose}>
            dismiss-open
        </button>
    ),
}));

vi.mock('@/components/qubdi/project-create-dialog', () => ({
    ProjectCreateDialog: (p: { onExamples?: () => void }) => (
        <button onClick={p.onExamples}>to-examples</button>
    ),
}));
vi.mock('@/features/examples/examples-dialog', () => ({
    ExamplesDialog: (p: { onDismiss?: () => void }) => (
        <button onClick={p.onDismiss}>dismiss-examples</button>
    ),
}));

import { DialogProvider } from '../dialog-provider';
import { useDialog } from '@/hooks/use-dialog';

const Opener: React.FC = () => {
    const d = useDialog();
    return (
        <button onClick={() => d.openOpenDiagramDialog({ canClose: false })}>
            start
        </button>
    );
};
const CreateOpener: React.FC = () => {
    const d = useDialog();
    return <button onClick={() => d.openCreateDiagramDialog()}>create</button>;
};
const Where: React.FC = () => (
    <p data-testid="where">{useLocation().pathname}</p>
);

const setup = () =>
    render(
        <MemoryRouter
            initialEntries={['/admin/projects', '/p']}
            initialIndex={1}
        >
            <DialogProvider>
                <Routes>
                    <Route
                        path="*"
                        element={
                            <>
                                <Opener />
                                <Where />
                            </>
                        }
                    />
                </Routes>
            </DialogProvider>
        </MemoryRouter>
    );

describe('project start dialog with no diagram open', () => {
    it('is dismissable and leaves for the previous page', async () => {
        // the browser router keeps the position in history.state
        window.history.replaceState({ idx: 1 }, '');
        setup();
        fireEvent.click(screen.getByText('start'));
        const dismiss = await screen.findByText('dismiss-open');
        expect(dismiss.getAttribute('data-can-close')).toBe('true');
        fireEvent.click(dismiss);
        await waitFor(() =>
            expect(screen.getByTestId('where').textContent).toBe(
                '/admin/projects'
            )
        );
    });

    it('switching from the new-diagram dialog to the examples stays on the page', async () => {
        window.history.replaceState({ idx: 1 }, '');
        render(
            <MemoryRouter
                initialEntries={['/admin/projects', '/p']}
                initialIndex={1}
            >
                <DialogProvider>
                    <Routes>
                        <Route
                            path="*"
                            element={
                                <>
                                    <CreateOpener />
                                    <Where />
                                </>
                            }
                        />
                    </Routes>
                </DialogProvider>
            </MemoryRouter>
        );
        fireEvent.click(screen.getByText('create'));
        fireEvent.click(await screen.findByText('to-examples'));
        const dismiss = await screen.findByText('dismiss-examples');
        // give a (wrong) leave a chance to happen
        await new Promise((r) => setTimeout(r, 20));
        expect(screen.getByTestId('where').textContent).toBe('/p');
        // backing out of the examples leaves, like the other start dialogs
        fireEvent.click(dismiss);
        await waitFor(() =>
            expect(screen.getByTestId('where').textContent).toBe(
                '/admin/projects'
            )
        );
    });
});
