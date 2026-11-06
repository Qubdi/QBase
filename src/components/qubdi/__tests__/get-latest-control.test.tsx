import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/platform/ui/tooltip';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import type { MyProject } from '@/lib/qubdi/api';
import { registerSaveDiscard } from '@/lib/qubdi/save-status-store';
import { GetLatestControl } from '../get-latest-control';
import { WorkspaceContext, type Workspace } from '../workspace-context';

const getLatest = vi.fn();
vi.mock('@/lib/qubdi/get-latest', () => ({
    getLatestFromServer: (...a: unknown[]) => getLatest(...a),
}));

const deleteLocal = vi.fn();
vi.mock('@/hooks/use-storage', () => ({
    useStorage: () => ({ deleteDiagram: deleteLocal }),
}));

vi.mock('@/hooks/use-diagram', () => ({
    useDiagram: () => ({ currentDiagram: { name: 'Shop' } }),
}));

const toast = vi.fn();
vi.mock('@/platform/toast/use-toast', () => ({
    useToast: () => ({ toast }),
}));

const workspace: Workspace = {
    project: { slug: 'Qubdi' } as MyProject,
    localDiagramId: 'local-1',
    remoteDiagramId: 'r1',
};

const show = ({
    enabled = true,
    user = { email: 'a@b.c' },
    ws = workspace,
}: {
    enabled?: boolean;
    user?: unknown;
    ws?: Workspace | null;
} = {}) =>
    render(
        <TooltipProvider>
            <qubdiContext.Provider
                value={{ enabled, user } as unknown as QubdiContext}
            >
                <WorkspaceContext.Provider value={ws}>
                    <GetLatestControl />
                </WorkspaceContext.Provider>
            </qubdiContext.Provider>
        </TooltipProvider>
    );

const button = () =>
    screen.queryByRole('button', { name: 'Get latest from server' });

describe('GetLatestControl', () => {
    beforeEach(() => {
        getLatest.mockReset().mockResolvedValue(undefined);
        toast.mockReset();
    });
    afterEach(() => registerSaveDiscard(null));

    it('is an icon in the navbar for a diagram that is on the server', () => {
        show();
        expect(button()).toBeTruthy();
        expect(button()!.textContent).toBe('');
    });

    it.each([
        ['without a server', { enabled: false }],
        ['signed out', { user: null }],
        ['outside a project', { ws: null }],
        [
            'before the diagram has a copy in this browser',
            { ws: { ...workspace, localDiagramId: undefined } },
        ],
        [
            'on a project page with no diagram open',
            { ws: { ...workspace, remoteDiagramId: undefined } },
        ],
    ])('is hidden %s', (_, props) => {
        show(props);
        expect(button()).toBeNull();
    });

    it('asks first, and does nothing when the user cancels', () => {
        show();
        fireEvent.click(button()!);
        expect(screen.getByText('Get the latest version?')).toBeTruthy();
        expect(screen.getByRole('alertdialog').textContent).toContain(
            'Changes to it that were not saved to the project are lost'
        );
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(getLatest).not.toHaveBeenCalled();
    });

    it('replaces the local copy on confirm, dropping unsaved edits first', async () => {
        const discard = vi.fn();
        registerSaveDiscard(discard);
        show();
        fireEvent.click(button()!);
        fireEvent.click(screen.getByRole('button', { name: 'Get latest' }));
        await waitFor(() => expect(getLatest).toHaveBeenCalledTimes(1));
        const args = getLatest.mock.calls[0][0];
        expect(args).toMatchObject({
            localId: 'local-1',
            remoteId: 'r1',
            projectSlug: 'Qubdi',
            deleteLocal,
        });
        // the page leaving must not send the edits that were just discarded
        expect(discard).not.toHaveBeenCalled();
        args.beforeReload();
        expect(discard).toHaveBeenCalledTimes(1);
    });

    it('reports a failure and keeps the editor usable', async () => {
        getLatest.mockRejectedValue(new Error('disk full'));
        show();
        fireEvent.click(button()!);
        fireEvent.click(screen.getByRole('button', { name: 'Get latest' }));
        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Could not get the latest version',
                    variant: 'destructive',
                })
            )
        );
        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).toBeNull()
        );
    });
});
