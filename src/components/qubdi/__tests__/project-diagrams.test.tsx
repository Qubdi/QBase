import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/platform/ui/tooltip';
import type { RemoteDiagramSummary } from '@/lib/qubdi/api';
import { setRemoteId } from '@/lib/qubdi/remote-map';
import { ProjectDiagrams } from '../project-diagrams';

const deleteLocal = vi.fn();
const listLocal = vi.fn();
vi.mock('@/qbase/use-storage', () => ({
    useStorage: () => ({
        deleteDiagram: (...a: unknown[]) => deleteLocal(...a),
        listDiagrams: (...a: unknown[]) => listLocal(...a),
    }),
}));

const deleteRemote = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: { deleteDiagram: (...a: unknown[]) => deleteRemote(...a) },
}));

// Radix menus expect pointer and scroll APIs that happy-dom lacks
beforeAll(() => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => undefined;
    Element.prototype.scrollIntoView ??= () => undefined;
});

const diagram = (
    n: number,
    over: Partial<RemoteDiagramSummary> = {}
): RemoteDiagramSummary => ({
    id: `d${n}`,
    title: `Diagram ${n}`,
    updatedAt: '2025-03-02T10:00:00.000Z',
    ownerId: 'u1',
    ownerEmail: `owner${n}@corp.io`,
    projectId: 'p1',
    role: 'editor',
    databaseType: 'postgresql',
    databaseEdition: null,
    tableCount: n,
    relationshipCount: 1,
    createdAt: '2025-03-01T10:00:00.000Z',
    ...over,
});

const renderTable = (
    diagrams: RemoteDiagramSummary[],
    props: Partial<React.ComponentProps<typeof ProjectDiagrams>> = {}
) => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    const onChanged = vi.fn();
    render(
        <TooltipProvider>
            <ProjectDiagrams
                diagrams={diagrams}
                projectSlug="Qubdi"
                selectedId={null}
                onSelect={onSelect}
                onOpen={onOpen}
                onChanged={onChanged}
                {...props}
            />
        </TooltipProvider>
    );
    return { onSelect, onOpen, onChanged };
};

const rowOf = (title: string) =>
    screen.getByText(title).closest('tr') as HTMLElement;

const openMenu = (title: string) =>
    fireEvent.keyDown(
        screen.getByRole('button', { name: `Actions for ${title}` }),
        {
            key: 'Enter',
        }
    );

describe('ProjectDiagrams table', () => {
    beforeEach(() => {
        localStorage.clear();
        deleteLocal.mockReset();
        listLocal.mockReset();
        deleteRemote.mockReset();
        listLocal.mockResolvedValue([]);
        deleteRemote.mockResolvedValue(undefined);
        deleteLocal.mockResolvedValue(undefined);
    });

    it('shows what the original dialog shows for each diagram', () => {
        renderTable([diagram(1), diagram(2)]);
        for (const h of [
            'Name',
            'Created by',
            'Created',
            'Last modified',
            'Tables',
        ]) {
            expect(screen.getByRole('columnheader', { name: h })).toBeTruthy();
        }
        const row = within(rowOf('Diagram 2'));
        expect(row.getByText('owner2@corp.io')).toBeTruthy();
        expect(row.getByText('Editor')).toBeTruthy();
        expect(row.getByText('2')).toBeTruthy(); // tables
        expect(row.getByRole('img', { name: 'database' })).toBeTruthy();
    });

    it('draws a database icon for every diagram, whatever its database', () => {
        renderTable([
            diagram(1, { databaseType: 'postgresql' }),
            diagram(2, { databaseType: 'mysql' }),
            diagram(3, { databaseType: null }),
            diagram(4, { databaseType: 'something-new' }),
        ]);
        expect(screen.getAllByRole('img', { name: 'database' })).toHaveLength(
            4
        );
    });

    it('uses different icons for different databases', () => {
        renderTable([
            diagram(1, { databaseType: 'postgresql' }),
            diagram(2, { databaseType: 'mysql' }),
        ]);
        const [a, b] = screen
            .getAllByRole('img', { name: 'database' })
            .map((i) => i.getAttribute('src'));
        expect(a).toBeTruthy();
        expect(a).not.toBe(b);
    });

    it('shows dashes when the server does not know a date or the creator', () => {
        renderTable([
            diagram(1, {
                createdAt: null,
                ownerEmail: null,
                tableCount: undefined,
            }),
        ]);
        const cells = within(rowOf('Diagram 1')).getAllByText('—');
        expect(cells.length).toBe(2); // created and created by
        expect(within(rowOf('Diagram 1')).getByText('0')).toBeTruthy();
    });

    it('describes the counts in a tooltip', () => {
        renderTable([diagram(1, { tableCount: 1, relationshipCount: 3 })]);
        const cell = within(rowOf('Diagram 1')).getByText('1').closest('td');
        expect(cell?.getAttribute('title')).toBe('1 table, 3 relationships');
    });

    it('marks the selected row', () => {
        renderTable([diagram(1), diagram(2)], { selectedId: 'd2' });
        expect(rowOf('Diagram 2').getAttribute('data-state')).toBe('selected');
        expect(rowOf('Diagram 1').getAttribute('data-state')).toBe('');
    });

    it('selects on click and on focus', () => {
        const { onSelect, onOpen } = renderTable([diagram(1), diagram(2)]);
        fireEvent.click(rowOf('Diagram 1'), { detail: 1 });
        expect(onSelect).toHaveBeenLastCalledWith('d1');
        fireEvent.focus(rowOf('Diagram 2'));
        expect(onSelect).toHaveBeenLastCalledWith('d2');
        expect(onOpen).not.toHaveBeenCalled();
    });

    it('opens on double-click', () => {
        const { onOpen } = renderTable([diagram(1), diagram(2)]);
        fireEvent.click(rowOf('Diagram 2'), { detail: 2 });
        expect(onOpen).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'd2' })
        );
    });

    it('opens with Enter or Space', () => {
        const { onOpen } = renderTable([diagram(1)]);
        fireEvent.keyDown(rowOf('Diagram 1'), { key: 'Enter' });
        fireEvent.keyDown(rowOf('Diagram 1'), { key: ' ' });
        expect(onOpen).toHaveBeenCalledTimes(2);
    });

    it('moves between rows with the arrow keys', () => {
        renderTable([diagram(1), diagram(2), diagram(3)]);
        rowOf('Diagram 1').focus();
        fireEvent.keyDown(rowOf('Diagram 1'), { key: 'ArrowDown' });
        expect(document.activeElement).toBe(rowOf('Diagram 2'));
        fireEvent.keyDown(rowOf('Diagram 2'), { key: 'ArrowDown' });
        expect(document.activeElement).toBe(rowOf('Diagram 3'));
        fireEvent.keyDown(rowOf('Diagram 3'), { key: 'ArrowDown' }); // no row after
        expect(document.activeElement).toBe(rowOf('Diagram 3'));
        fireEvent.keyDown(rowOf('Diagram 3'), { key: 'ArrowUp' });
        expect(document.activeElement).toBe(rowOf('Diagram 2'));
    });

    it('leaves keys typed inside the row menu to the menu', () => {
        const { onOpen } = renderTable([diagram(1)]);
        fireEvent.keyDown(
            screen.getByRole('button', { name: 'Actions for Diagram 1' }),
            { key: 'Enter' }
        );
        expect(onOpen).not.toHaveBeenCalled();
    });

    it('says so when the project has no diagrams', () => {
        renderTable([]);
        expect(
            screen.getByText('No diagrams in this project yet.')
        ).toBeTruthy();
    });

    describe('row menu', () => {
        it('opens the diagram', async () => {
            const { onOpen } = renderTable([diagram(1)]);
            openMenu('Diagram 1');
            fireEvent.click(
                await screen.findByRole('menuitem', { name: 'Open' })
            );
            expect(onOpen).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'd1' })
            );
        });

        it('offers "Get latest" only when this browser has a copy', async () => {
            setRemoteId('local-1', 'd1');
            listLocal.mockResolvedValue([{ id: 'local-1' }]);
            renderTable([diagram(1), diagram(2)]);
            expect(
                await screen.findByText('Saved in this browser')
            ).toBeTruthy();
            openMenu('Diagram 1');
            expect(
                await screen.findByRole('menuitem', {
                    name: 'Get latest from server',
                })
            ).toBeTruthy();
        });

        it('does not offer "Get latest" for a diagram only on the server', async () => {
            renderTable([diagram(1)]);
            openMenu('Diagram 1');
            await screen.findByRole('menuitem', { name: 'Open' });
            expect(
                screen.queryByRole('menuitem', {
                    name: 'Get latest from server',
                })
            ).toBeNull();
        });

        it('offers Delete to admins only', async () => {
            renderTable([
                diagram(1, { role: 'owner' }),
                diagram(2, { role: 'editor' }),
                diagram(3, { role: 'viewer' }),
            ]);
            openMenu('Diagram 1');
            expect(
                await screen.findByRole('menuitem', {
                    name: 'Delete for everyone',
                })
            ).toBeTruthy();
        });

        it.each(['editor', 'viewer'] as const)(
            'hides Delete from a %s',
            async (role) => {
                renderTable([diagram(1, { role })]);
                openMenu('Diagram 1');
                await screen.findByRole('menuitem', { name: 'Open' });
                expect(
                    screen.queryByRole('menuitem', {
                        name: 'Delete for everyone',
                    })
                ).toBeNull();
            }
        );

        it('asks before deleting, and deletes for everyone on confirm', async () => {
            const { onChanged } = renderTable([diagram(1, { role: 'owner' })]);
            openMenu('Diagram 1');
            fireEvent.click(
                await screen.findByRole('menuitem', {
                    name: 'Delete for everyone',
                })
            );
            expect(
                await screen.findByText('Delete this diagram?')
            ).toBeTruthy();
            expect(deleteRemote).not.toHaveBeenCalled();
            const dialog = screen.getByRole('alertdialog');
            fireEvent.click(
                within(dialog).getByRole('button', {
                    name: 'Delete for everyone',
                })
            );
            await waitFor(() =>
                expect(deleteRemote).toHaveBeenCalledWith('d1')
            );
            await waitFor(() => expect(onChanged).toHaveBeenCalled());
        });

        it('does not delete when cancelled', async () => {
            renderTable([diagram(1, { role: 'owner' })]);
            openMenu('Diagram 1');
            fireEvent.click(
                await screen.findByRole('menuitem', {
                    name: 'Delete for everyone',
                })
            );
            fireEvent.click(
                within(await screen.findByRole('alertdialog')).getByRole(
                    'button',
                    {
                        name: 'Cancel',
                    }
                )
            );
            expect(deleteRemote).not.toHaveBeenCalled();
        });

        it('also removes this browser’s copy of a deleted diagram', async () => {
            setRemoteId('local-1', 'd1');
            listLocal.mockResolvedValue([{ id: 'local-1' }]);
            renderTable([diagram(1, { role: 'owner' })]);
            await screen.findByText('Saved in this browser');
            openMenu('Diagram 1');
            fireEvent.click(
                await screen.findByRole('menuitem', {
                    name: 'Delete for everyone',
                })
            );
            fireEvent.click(
                within(await screen.findByRole('alertdialog')).getByRole(
                    'button',
                    {
                        name: 'Delete for everyone',
                    }
                )
            );
            await waitFor(() =>
                expect(deleteLocal).toHaveBeenCalledWith('local-1')
            );
        });

        it('shows the error and keeps the list when the server refuses', async () => {
            deleteRemote.mockRejectedValue(new Error('nope'));
            const { onChanged } = renderTable([diagram(1, { role: 'owner' })]);
            openMenu('Diagram 1');
            fireEvent.click(
                await screen.findByRole('menuitem', {
                    name: 'Delete for everyone',
                })
            );
            fireEvent.click(
                within(await screen.findByRole('alertdialog')).getByRole(
                    'button',
                    {
                        name: 'Delete for everyone',
                    }
                )
            );
            expect(await screen.findByRole('alert')).toBeTruthy();
            expect(onChanged).not.toHaveBeenCalled();
        });
    });
});
