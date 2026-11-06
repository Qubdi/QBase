import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/platform/ui/tooltip';
import type { MyProject, RemoteDiagramSummary } from '@/lib/qubdi/api';
import { ProjectOpenDialog } from '../project-open-dialog';

vi.mock('@/hooks/use-storage', () => ({
    useStorage: () => ({
        deleteDiagram: vi.fn(),
        listDiagrams: async () => [],
    }),
}));

const listDiagrams = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        listDiagrams: (...a: unknown[]) => listDiagrams(...a),
        deleteDiagram: vi.fn(),
    },
}));

const project: MyProject = {
    id: 'p1',
    name: 'Qubdi',
    slug: 'Qubdi',
    description: '',
    diagramCount: 3,
    role: 'editor',
};

const diagram = (
    n: number,
    over: Partial<RemoteDiagramSummary> = {}
): RemoteDiagramSummary => ({
    id: `d${n}`,
    title: `Diagram ${n}`,
    updatedAt: `2025-03-0${n}T10:00:00.000Z`,
    ownerId: 'u',
    ownerEmail: 'o@corp.io',
    projectId: 'p1',
    role: 'editor',
    databaseType: 'postgresql',
    tableCount: n,
    relationshipCount: 0,
    createdAt: '2025-02-01T10:00:00.000Z',
    ...over,
});

const Where: React.FC = () => (
    <div data-testid="where">{useLocation().pathname}</div>
);

const renderDialog = (
    props: Partial<React.ComponentProps<typeof ProjectOpenDialog>> = {}
) => {
    const onClose = vi.fn();
    const onCreate = vi.fn();
    render(
        <MemoryRouter>
            <TooltipProvider>
                <ProjectOpenDialog
                    open
                    project={project}
                    onClose={onClose}
                    onCreate={onCreate}
                    {...props}
                />
                <Where />
            </TooltipProvider>
        </MemoryRouter>
    );
    return { onClose, onCreate };
};

const titles = () =>
    screen
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.querySelector('span.font-medium')?.textContent);

describe('ProjectOpenDialog', () => {
    beforeEach(() => {
        listDiagrams.mockReset();
        // the server keeps to the project and sorts newest first
        listDiagrams.mockResolvedValue([diagram(3), diagram(2), diagram(1)]);
    });

    it('asks the server for this project’s diagrams only, and lists them as sent', async () => {
        renderDialog();
        await screen.findByText('Diagram 3');
        expect(listDiagrams).toHaveBeenCalledWith({ projectId: 'p1' });
        expect(titles()).toEqual(['Diagram 3', 'Diagram 2', 'Diagram 1']);
    });

    it('is a dialog of limited width, not the whole screen', async () => {
        renderDialog();
        await screen.findByText('Diagram 3');
        const classes = screen.getByRole('dialog').className;
        expect(classes).toContain('max-w-5xl');
        expect(classes).not.toContain('max-w-none');
        expect(classes).not.toMatch(/min-w-\[\d+vw\]/);
        // and it still leaves a margin on small screens
        expect(classes).toContain('w-[calc(100vw-2rem)]');
    });

    it('names the project and keeps Open disabled until a diagram is chosen', async () => {
        renderDialog();
        await screen.findByText('Diagram 3');
        expect(screen.getByText('Qubdi')).toBeTruthy();
        const open = screen.getByRole('button', {
            name: 'Open diagram',
        }) as HTMLButtonElement;
        expect(open.disabled).toBe(true);
        fireEvent.click(screen.getByText('Diagram 2').closest('tr')!);
        expect(open.disabled).toBe(false);
    });

    it('opens the chosen diagram at its project URL and closes', async () => {
        const { onClose } = renderDialog();
        await screen.findByText('Diagram 2');
        fireEvent.click(screen.getByText('Diagram 2').closest('tr')!);
        fireEvent.click(screen.getByRole('button', { name: 'Open diagram' }));
        expect(onClose).toHaveBeenCalled();
        expect(screen.getByTestId('where').textContent).toBe(
            '/Qubdi/diagrams/d2'
        );
    });

    it('opens a diagram on double-click', async () => {
        renderDialog();
        await screen.findByText('Diagram 1');
        fireEvent.click(screen.getByText('Diagram 1').closest('tr')!, {
            detail: 2,
        });
        expect(screen.getByTestId('where').textContent).toBe(
            '/Qubdi/diagrams/d1'
        );
    });

    it('filters by the search text and says when nothing matches', async () => {
        renderDialog();
        await screen.findByText('Diagram 3');
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'diagram 2' },
        });
        expect(titles()).toEqual(['Diagram 2']);
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'zzz' },
        });
        expect(screen.getByText(/No diagrams match/)).toBeTruthy();
    });

    it('forgets a selection that the search filtered out', async () => {
        renderDialog();
        await screen.findByText('Diagram 3');
        fireEvent.click(screen.getByText('Diagram 3').closest('tr')!);
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'diagram 1' },
        });
        const open = screen.getByRole('button', {
            name: 'Open diagram',
        }) as HTMLButtonElement;
        expect(open.disabled).toBe(true);
    });

    it('offers New diagram to editors', async () => {
        const { onCreate } = renderDialog();
        await screen.findByText('Diagram 3');
        fireEvent.click(screen.getByRole('button', { name: /New diagram/ }));
        expect(onCreate).toHaveBeenCalled();
    });

    it('does not offer New diagram to a viewer', async () => {
        renderDialog({ project: { ...project, role: 'viewer' } });
        await screen.findByText('Diagram 3');
        expect(
            screen.queryByRole('button', { name: /New diagram/ })
        ).toBeNull();
    });

    it('has a Cancel that closes it', async () => {
        const { onClose } = renderDialog();
        await screen.findByText('Diagram 3');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('cannot be dismissed while no diagram is open', async () => {
        renderDialog({ canClose: false });
        await screen.findByText('Diagram 3');
        expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    });

    it('shows the server’s error and an empty list when loading fails', async () => {
        listDiagrams.mockRejectedValue(new Error('offline'));
        renderDialog();
        expect(await screen.findByRole('alert')).toBeTruthy();
        await waitFor(() =>
            expect(
                screen.getByText('No diagrams in this project yet.')
            ).toBeTruthy()
        );
    });
});
