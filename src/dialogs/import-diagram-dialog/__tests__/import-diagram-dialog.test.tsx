import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ImportDiagramDialog } from '../import-diagram-dialog';

const addDiagram = vi.fn();
vi.mock('@/hooks/use-storage', () => ({
    useStorage: () => ({ addDiagram }),
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
                onFilesChange([new File(['not json'], 'broken.json')])
            }
        >
            pick file
        </button>
    ),
}));

describe('ImportDiagramDialog', () => {
    it('shows the error for a file it cannot read, without a stray rejection', async () => {
        render(
            <MemoryRouter>
                <ImportDiagramDialog dialog={{ open: true }} />
            </MemoryRouter>
        );
        fireEvent.click(screen.getByText('pick file'));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Import' }));
            await new Promise((resolve) => setTimeout(resolve, 20));
        });
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(addDiagram).not.toHaveBeenCalled();
    });
});
