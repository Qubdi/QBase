import React, { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import { ApiError } from '@/lib/qubdi/api';
import { diagramToServerContent } from '@/lib/qubdi/content';
import { getBaseUpdatedAt, setBaseUpdatedAt } from '@/lib/qubdi/remote-version';
import {
    flushPendingSave,
    hasUnsavedChanges,
    resetSaveStatus,
    useSaveStatus,
} from '@/lib/qubdi/save-status-store';
import { rememberSentContent } from '@/lib/qubdi/sent-content';
import type { Diagram } from '@/qbase/diagram-types';
import { DiagramAccessContext } from '../diagram-access-context';
import { WorkspaceContext, type Workspace } from '../workspace-context';
import { ServerAutosave } from '../server-autosave';

type Remote = { updatedAt: string; content: Record<string, unknown> | null };
let remote: Remote = { updatedAt: 'v1', content: null };
// a real request takes longer than a microtask
const getDiagram = vi.fn(async () => {
    await new Promise((r) => setTimeout(r, 5));
    return remote;
});

vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: { getDiagram: () => getDiagram() },
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

const held: { seen?: ReturnType<typeof useSaveStatus> } = {};
const Status: React.FC = () => {
    const value = useSaveStatus();
    useEffect(() => {
        held.seen = value;
    });
    return null;
};

const tree = (
    syncDiagram: QubdiContext['syncDiagram'],
    role: 'editor' | 'viewer' = 'editor'
) => (
    <qubdiContext.Provider
        value={{ enabled: true, syncDiagram } as unknown as QubdiContext}
    >
        <WorkspaceContext.Provider value={workspace}>
            <DiagramAccessContext.Provider
                value={{
                    access:
                        role === 'editor'
                            ? {
                                  status: 'editor',
                                  projectId: 'p1',
                                  remoteId: 'r1',
                              }
                            : ({
                                  status: 'viewer',
                                  projectId: 'p1',
                                  remoteId: 'r1',
                              } as never),
                    refresh: () => undefined,
                }}
            >
                <Status />
                <ServerAutosave />
            </DiagramAccessContext.Provider>
        </WorkspaceContext.Provider>
    </qubdiContext.Provider>
);

const settle = () =>
    act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });

const wait = () =>
    act(async () => {
        await new Promise((r) => setTimeout(r, 40));
    });

const openAndEdit = async (
    sync: QubdiContext['syncDiagram'],
    role: 'editor' | 'viewer' = 'editor'
) => {
    current = diagram([]);
    const view = render(tree(sync, role));
    await settle();
    current = diagram([{ id: 't1' }]);
    view.rerender(tree(sync, role));
    await settle();
    return view;
};

beforeEach(() => {
    remote = { updatedAt: 'v1', content: null };
    getDiagram.mockClear();
});
afterEach(() => {
    vi.useRealTimers();
    resetSaveStatus();
});

describe('QBS-036 autosave sends 10 seconds after the last change, only for the lock holder', () => {
    it('waits ten seconds, then sends once', async () => {
        vi.useFakeTimers();
        const sync = vi.fn<QubdiContext['syncDiagram']>(async () => 'r1');
        const view = await openAndEdit(sync);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(9_900);
        });
        expect(sync).not.toHaveBeenCalled();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(200);
        });
        expect(sync).toHaveBeenCalledTimes(1);
        view.unmount();
    });

    it('a viewer (no lock) never sends', async () => {
        vi.useFakeTimers();
        const sync = vi.fn<QubdiContext['syncDiagram']>(async () => 'r1');
        const view = await openAndEdit(sync, 'viewer');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(30_000);
        });
        expect(sync).not.toHaveBeenCalled();
        view.unmount();
    });
});

describe('QBS-037 hiding or closing the page sends the final save with keep-alive', () => {
    it('pagehide sends the held edit asking for keepalive', async () => {
        const sync = vi.fn<QubdiContext['syncDiagram']>(async () => 'r1');
        const view = await openAndEdit(sync);
        await act(async () => {
            window.dispatchEvent(new Event('pagehide'));
        });
        expect(sync).toHaveBeenCalledTimes(1);
        expect(sync.mock.calls[0][2]).toEqual({ keepalive: true });
        view.unmount();
    });

    it('an ordinary send does not ask for keepalive', async () => {
        const sync = vi.fn<QubdiContext['syncDiagram']>(async () => 'r1');
        const view = await openAndEdit(sync);
        await act(() => flushPendingSave());
        expect(sync.mock.calls[0][2]).toEqual({ keepalive: false });
        view.unmount();
    });
});

describe('QBS-038 after a reload an unsent difference from the server is found and sent', () => {
    it('the server holds the base version but other content: the copy counts as unsaved', async () => {
        setBaseUpdatedAt('local-1', 'v1');
        remote = {
            updatedAt: 'v1',
            content: { tables: [], relationships: [] },
        };
        const sync = vi.fn<QubdiContext['syncDiagram']>(async () => 'r1');
        current = diagram([{ id: 'edited-before-reload' }]);
        const view = render(tree(sync));
        await wait();
        expect(hasUnsavedChanges()).toBe(true);
        await act(() => flushPendingSave());
        expect(sync).toHaveBeenCalledTimes(1);
        view.unmount();
    });

    it('the same content as the server leaves nothing to send', async () => {
        setBaseUpdatedAt('local-1', 'v1');
        current = diagram([{ id: 'same' }]);
        remote = {
            updatedAt: 'v1',
            content: diagramToServerContent(current) as Record<string, unknown>,
        };
        const sync = vi.fn<QubdiContext['syncDiagram']>(async () => 'r1');
        const view = render(tree(sync));
        await wait();
        expect(hasUnsavedChanges()).toBe(false);
        view.unmount();
    });

    it('a newer server version is not overwritten by this check', async () => {
        setBaseUpdatedAt('local-1', 'v1');
        remote = { updatedAt: 'v2', content: { tables: [] } };
        current = diagram([{ id: 'x' }]);
        const view = render(
            tree(vi.fn<QubdiContext['syncDiagram']>(async () => 'r1'))
        );
        await wait();
        expect(hasUnsavedChanges()).toBe(false);
        view.unmount();
    });
});

describe('QBS-039 a 409 shows the conflict with Overwrite; a save that landed unanswered is not one', () => {
    it('offers Overwrite; choosing it takes the server version as the base and saves again', async () => {
        setBaseUpdatedAt('local-1', 'v1');
        remote = { updatedAt: 'v9', content: { tables: ['theirs'] } };
        const sync = vi
            .fn<QubdiContext['syncDiagram']>()
            .mockRejectedValueOnce(new ApiError(409, 'changed'))
            .mockResolvedValue('r1');
        const view = await openAndEdit(sync);
        await act(() => flushPendingSave());
        await act(async () => {
            await new Promise((r) => setTimeout(r, 40));
        });
        expect(held.seen!.status).toBe('error');
        expect(held.seen!.overwrite).toBeTypeOf('function');
        await act(async () => {
            held.seen!.overwrite!();
            await new Promise((r) => setTimeout(r, 40));
        });
        expect(getBaseUpdatedAt('local-1')).toBe('v9');
        expect(sync).toHaveBeenCalledTimes(2);
        view.unmount();
    });

    it('when the server holds exactly what was sent, it takes that version and saves again, with no conflict', async () => {
        setBaseUpdatedAt('local-1', 'v1');
        const sync = vi
            .fn<QubdiContext['syncDiagram']>()
            .mockRejectedValueOnce(new ApiError(409, 'changed'))
            .mockResolvedValue('r1');
        const view = await openAndEdit(sync);
        const sent = diagramToServerContent(current) as Record<string, unknown>;
        rememberSentContent('local-1', sent);
        remote = { updatedAt: 'v5', content: sent };
        await act(() => flushPendingSave());
        await act(async () => {
            await new Promise((r) => setTimeout(r, 40));
        });
        expect(getBaseUpdatedAt('local-1')).toBe('v5');
        expect(sync).toHaveBeenCalledTimes(2);
        expect(held.seen!.overwrite).toBeNull();
        view.unmount();
    });
});
