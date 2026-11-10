import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MyProject } from '@/lib/qubdi/api';
import { ProjectCreateDialog } from './project-create-dialog';

// the two dialogs it chooses between are tested on their own
vi.mock('./new-diagram-dialog', () => ({
    NewDiagramDialog: (p: {
        open: boolean;
        onOpenChange: (open: boolean) => void;
        onImport: () => void;
        projectId: string;
    }) =>
        p.open ? (
            <div data-testid="blank" data-project={p.projectId}>
                <button onClick={p.onImport}>to-import</button>
                <button onClick={() => p.onOpenChange(false)}>
                    close-blank
                </button>
            </div>
        ) : null,
}));
vi.mock('./import-from-database-dialog', () => ({
    ImportFromDatabaseDialog: (p: {
        open: boolean;
        onOpenChange: (open: boolean) => void;
    }) =>
        p.open ? (
            <div data-testid="import">
                <button onClick={() => p.onOpenChange(false)}>
                    close-import
                </button>
            </div>
        ) : null,
}));

const project = (role: MyProject['role']): MyProject => ({
    id: 'p1',
    name: 'Shop',
    slug: 'shop',
    description: '',
    diagramCount: 0,
    role,
});

describe('ProjectCreateDialog', () => {
    it('shows nothing to a viewer, whatever `open` says', () => {
        const { container } = render(
            <ProjectCreateDialog
                open
                project={project('viewer')}
                onClose={() => {}}
            />
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('opens on the blank-diagram dialog for the project', () => {
        render(
            <ProjectCreateDialog
                open
                project={project('editor')}
                onClose={() => {}}
            />
        );
        expect(screen.getByTestId('blank')).toHaveAttribute(
            'data-project',
            'p1'
        );
        expect(screen.queryByTestId('import')).toBeNull();
    });

    it('shows neither dialog while closed', () => {
        render(
            <ProjectCreateDialog
                open={false}
                project={project('editor')}
                onClose={() => {}}
            />
        );
        expect(screen.queryByTestId('blank')).toBeNull();
        expect(screen.queryByTestId('import')).toBeNull();
    });

    it('swaps to the import dialog, and closing it closes the whole flow', () => {
        const onClose = vi.fn();
        render(
            <ProjectCreateDialog
                open
                project={project('editor')}
                onClose={onClose}
            />
        );
        fireEvent.click(screen.getByText('to-import'));
        expect(screen.queryByTestId('blank')).toBeNull();
        expect(screen.getByTestId('import')).toBeTruthy();
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('close-import'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closing the blank dialog calls onClose', () => {
        const onClose = vi.fn();
        render(
            <ProjectCreateDialog
                open
                project={project('editor')}
                onClose={onClose}
            />
        );
        fireEvent.click(screen.getByText('close-blank'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
