import React from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import {
    WorkspaceContext,
    type Workspace,
} from '@/components/qubdi/workspace-context';
import type { MyProject } from '@/lib/qubdi/api';
import { emptyDiagram } from '@/lib/qubdi/new-diagram';
import { DatabaseType } from '@/qbase/diagram-types';
import { diagramToJSONOutput } from '@/lib/export-import-utils';
import { ImportDiagramDialog } from '../import-diagram-dialog';

let badFile = false;
const addDiagram = vi.fn();
const deleteDiagram = vi.fn();
vi.mock('@/qbase/use-storage', () => ({
    useStorage: () => ({ addDiagram, deleteDiagram }),
}));
vi.mock('@/hooks/use-dialog', () => ({
    useDialog: () => ({
        closeImportDiagramDialog: vi.fn(),
        closeCreateDiagramDialog: vi.fn(),
    }),
}));
// the real uploader needs a drag and drop; this one hands over a file
vi.mock('@/components/file-uploader/file-uploader', () => ({
    FileUploader: ({
        onFilesChange,
    }: {
        onFilesChange: (files: File[]) => void;
    }) => (
        <button
            onClick={() =>
                onFilesChange([
                    new File(
                        [
                            badFile
                                ? 'not json'
                                : diagramToJSONOutput(
                                      emptyDiagram({
                                          id: 'old',
                                          name: 'Shop',
                                          databaseType: DatabaseType.POSTGRESQL,
                                      })
                                  ),
                        ],
                        'shop.json'
                    ),
                ])
            }
        >
            pick file
        </button>
    ),
}));

const workspace: Workspace = {
    project: { id: 'p1', name: 'Billing', slug: 'billing' } as MyProject,
    localDiagramId: undefined,
    remoteDiagramId: undefined,
};

const Where: React.FC = () => (
    <div data-testid="where">{useLocation().pathname}</div>
);

const show = (syncDiagram: QubdiContext['syncDiagram'], ws: Workspace | null) =>
    render(
        <MemoryRouter>
            <qubdiContext.Provider
                value={{ syncDiagram } as unknown as QubdiContext}
            >
                <WorkspaceContext.Provider value={ws}>
                    <ImportDiagramDialog dialog={{ open: true }} />
                </WorkspaceContext.Provider>
            </qubdiContext.Provider>
            <Where />
        </MemoryRouter>
    );

const importFile = async () => {
    fireEvent.click(screen.getByText('pick file'));
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Import' }));
        await new Promise((resolve) => setTimeout(resolve, 20));
    });
};

describe('ImportDiagramDialog', () => {
    beforeEach(() => {
        badFile = false;
        addDiagram.mockReset().mockResolvedValue(undefined);
        deleteDiagram.mockReset().mockResolvedValue(undefined);
    });

    it('creates the diagram in the open project and opens it at its project URL', async () => {
        const sync = vi.fn(async () => 'remote-1');
        show(sync, workspace);
        await importFile();
        expect(sync).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Shop' }),
            'p1'
        );
        await waitFor(() =>
            expect(screen.getByTestId('where').textContent).toBe(
                '/billing/diagrams/remote-1'
            )
        );
    });

    it('leaves no copy outside a project behind when the server refuses it', async () => {
        const sync = vi.fn(async () => {
            throw new Error('forbidden');
        });
        show(sync, workspace);
        await importFile();
        expect(deleteDiagram).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('where').textContent).toBe('/');
    });

    it('shows an error for a file it cannot read, and creates nothing', async () => {
        badFile = true;
        const sync = vi.fn();
        show(sync, workspace);
        await importFile();
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(addDiagram).not.toHaveBeenCalled();
        expect(sync).not.toHaveBeenCalled();
    });

    it('stays local when there is no project workspace', async () => {
        const sync = vi.fn();
        show(sync, null);
        await importFile();
        expect(sync).not.toHaveBeenCalled();
        await waitFor(() =>
            expect(screen.getByTestId('where').textContent).toMatch(
                /^\/diagrams\//
            )
        );
    });
});
