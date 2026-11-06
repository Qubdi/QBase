import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import { ApiError } from '@/lib/qubdi/api';
import { reportLockLost } from '@/lib/qubdi/lock-lost';
import {
    flushPendingSave,
    hasUnsavedChanges,
    resetSaveStatus,
} from '@/lib/qubdi/save-status-store';
import type { Diagram } from '@/qbase/diagram-types';
import { DiagramAccessContext } from '../diagram-access-context';
import { WorkspaceContext, type Workspace } from '../workspace-context';
import { ServerAutosave } from '../server-autosave';

vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    // nothing was unsent when the editor opened
    api: { getDiagram: async () => ({ updatedAt: 'v1', content: null }) },
}));

vi.mock('@/lib/qubdi/lock-lost', () => ({ reportLockLost: vi.fn() }));

let current: Diagram;
vi.mock('@/qbase/use-diagram', () => ({
    useDiagram: () => ({ currentDiagram: current }),
}));

const diagram = (tables: unknown[]): Diagram =>
    ({
        id: 'local-1',
        name: 'Shop',
        databaseType: 'postgresql',
        tables,
        relationships: [],
        createdAt: new Date(0),
        updatedAt: new Date(0),
    }) as unknown as Diagram;

const workspace = {
    project: { id: 'p1', slug: 'p1' },
    localDiagramId: 'local-1',
    remoteDiagramId: 'r1',
} as unknown as Workspace;

const tree = (syncDiagram: QubdiContext['syncDiagram']) => (
    <qubdiContext.Provider
        value={{ enabled: true, syncDiagram } as unknown as QubdiContext}
    >
        <WorkspaceContext.Provider value={workspace}>
            <DiagramAccessContext.Provider
                value={{
                    access: {
                        status: 'editor',
                        projectId: 'p1',
                        remoteId: 'r1',
                    },
                    refresh: () => undefined,
                }}
            >
                <ServerAutosave />
            </DiagramAccessContext.Provider>
        </WorkspaceContext.Provider>
    </qubdiContext.Provider>
);

const settle = () =>
    act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

/** Opens the editor, then makes one edit that the autosaver is now holding. */
const openAndEdit = async (syncDiagram: QubdiContext['syncDiagram']) => {
    current = diagram([]);
    const view = render(tree(syncDiagram));
    await settle();
    current = diagram([{ id: 't1' }]);
    view.rerender(tree(syncDiagram));
    await settle();
    return view;
};

describe('ServerAutosave', () => {
    beforeEach(() => {
        vi.mocked(reportLockLost).mockClear();
    });
    afterEach(() => resetSaveStatus());

    it('sends an edit it is holding when asked to flush', async () => {
        const sync = vi.fn(async () => 'r1');
        const view = await openAndEdit(sync);
        expect(sync).not.toHaveBeenCalled();
        await act(() => flushPendingSave());
        expect(sync).toHaveBeenCalledTimes(1);
        view.unmount();
    });

    it('leaves no error behind when the final flush on leaving fails', async () => {
        const sync = vi.fn(async () => {
            throw new Error('offline');
        });
        const view = await openAndEdit(sync);
        // leaving the diagram flushes the held edit, and that send fails
        await act(async () => view.unmount());
        await settle();
        expect(sync).toHaveBeenCalledTimes(1);
        expect(hasUnsavedChanges()).toBe(false);
    });

    describe('when the lock goes to someone else', () => {
        it('reports it and drops the unsent edit instead of sending it again on the way out', async () => {
            const sync = vi.fn(async () => {
                throw new ApiError(423, 'locked');
            });
            const view = await openAndEdit(sync);
            await act(() => flushPendingSave());
            expect(sync).toHaveBeenCalledTimes(1);
            expect(reportLockLost).toHaveBeenCalledWith('r1');
            // leaving the diagram would flush what is pending: nothing is
            await act(async () => view.unmount());
            await settle();
            expect(sync).toHaveBeenCalledTimes(1);
        });
    });

    describe('closing the tab', () => {
        const ask = () => {
            const event = new Event('beforeunload', { cancelable: true });
            window.dispatchEvent(event);
            return event.defaultPrevented;
        };

        it('asks first while an edit is unsent', async () => {
            const view = await openAndEdit(vi.fn(async () => 'r1'));
            expect(ask()).toBe(true);
            view.unmount();
        });

        it('does not ask when everything is saved', async () => {
            const view = await openAndEdit(vi.fn(async () => 'r1'));
            await act(() => flushPendingSave());
            expect(ask()).toBe(false);
            view.unmount();
        });

        it('stops asking once the editor is gone', async () => {
            const view = await openAndEdit(vi.fn(async () => 'r1'));
            view.unmount();
            expect(ask()).toBe(false);
        });
    });
});
