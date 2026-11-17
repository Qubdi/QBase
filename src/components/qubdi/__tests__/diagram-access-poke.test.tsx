import React from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import type {
    MyProject,
    RemoteDiagramSummary,
    RemoteUser,
} from '@/lib/qubdi/api';
import { setProjectId, setRemoteId } from '@/lib/qubdi/remote-map';
import { localDiagramsOver } from '@/qbase/local-diagrams';
import { StorageContext } from '@/qbase/storage-context';
import { MemoryStorageAdapter } from '@/persistence/memory-adapter';
import { withTables } from '@/core/testing/helpers';
import { DiagramAccessGate } from '../diagram-access';
import { useDiagramAccess } from '../diagram-access-context';

// The gate, the edit lock, the lock stream and the holder's prompt together:
// only the server (the api and the EventSource) is replaced.
const api = vi.hoisted(() => ({
    getProject: vi.fn(),
    getDiagramSummary: vi.fn(),
    getDiagram: vi.fn(),
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
    answerPoke: vi.fn(),
    lockEventsUrl: (id: string, editorId: string) =>
        `http://srv/diagrams/${id}/lock/events?editorId=${editorId}`,
}));
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api,
}));
vi.mock('@/lib/qubdi/editor-id', () => ({ getEditorId: () => 'tab-1' }));

class FakeEventSource {
    static CLOSED = 2;
    static instances: FakeEventSource[] = [];
    readyState = 0;
    closed = false;
    listeners = new Map<string, Array<(e: { data?: string }) => void>>();
    constructor(
        public url: string,
        public init?: EventSourceInit
    ) {
        FakeEventSource.instances.push(this);
    }
    addEventListener(type: string, fn: (e: { data?: string }) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
    }
    emit(type: string, data: unknown) {
        this.listeners
            .get(type)
            ?.forEach((fn) => fn({ data: JSON.stringify(data) }));
    }
    close() {
        this.closed = true;
        this.readyState = FakeEventSource.CLOSED;
    }
}

const project: MyProject = {
    id: 'p1',
    name: 'Billing',
    slug: 'billing',
    description: '',
    diagramCount: 1,
    role: 'editor',
};
const summary = (
    over: Partial<RemoteDiagramSummary> = {}
): RemoteDiagramSummary =>
    ({
        id: 'r1',
        title: 'Shop',
        updatedAt: '2025-03-01T10:00:00.000Z',
        ownerId: 'u',
        ownerEmail: 'o@corp.io',
        projectId: 'p1',
        role: 'editor',
        databaseType: 'postgresql',
        tableCount: 1,
        relationshipCount: 0,
        createdAt: '2025-02-01T10:00:00.000Z',
        ...over,
    }) as RemoteDiagramSummary;
const user = { id: 'u', email: 'me@corp.io', isAdmin: false } as RemoteUser;
const request = { pokeId: 'p1', from: 'sam@corp.io', waitSeconds: 60 };

const Probe: React.FC = () => {
    const { access } = useDiagramAccess();
    return (
        <div>
            <div>status:{access.status}</div>
            {access.status === 'taken' ? (
                <div>holder:{access.holder}</div>
            ) : null}
        </div>
    );
};

const open = async () => {
    const adapter = new MemoryStorageAdapter();
    const design = withTables(['a']);
    await adapter.save(design);
    setRemoteId(design.id, 'r1');
    setProjectId(design.id, 'p1');
    const view = render(
        <MemoryRouter initialEntries={['/billing/diagrams/r1']}>
            <qubdiContext.Provider
                value={{ enabled: true, user } as unknown as QubdiContext}
            >
                <StorageContext.Provider
                    value={{ adapter, diagrams: localDiagramsOver(adapter) }}
                >
                    <Routes>
                        <Route
                            path=":projectSlug/diagrams/:remoteDiagramId"
                            element={
                                <DiagramAccessGate fallback={<div>start</div>}>
                                    <Probe />
                                </DiagramAccessGate>
                            }
                        />
                    </Routes>
                </StorageContext.Provider>
            </qubdiContext.Provider>
        </MemoryRouter>
    );
    await screen.findByText(/^status:/);
    return view;
};
const stream = () => FakeEventSource.instances[0];

describe('asking the holder to step out, through the whole editor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        FakeEventSource.instances = [];
        vi.stubGlobal('EventSource', FakeEventSource);
        api.getProject.mockResolvedValue(project);
        api.getDiagramSummary.mockResolvedValue(summary());
        api.getDiagram.mockResolvedValue(undefined);
        api.acquireLock.mockResolvedValue({ held: true });
        api.releaseLock.mockResolvedValue(undefined);
        api.answerPoke.mockResolvedValue(undefined);
    });
    afterEach(() => vi.unstubAllGlobals());

    it('listens to this editor on the open diagram', async () => {
        await open();
        expect(FakeEventSource.instances).toHaveLength(1);
        expect(stream().url).toBe(
            'http://srv/diagrams/r1/lock/events?editorId=tab-1'
        );
        expect(stream().init).toEqual({ withCredentials: true });
    });

    it('shows the editor holding the diagram who asks, and declining changes nothing', async () => {
        await open();
        expect(screen.queryByRole('alertdialog')).toBeNull();

        act(() => stream().emit('poke', request));
        expect(
            await screen.findByText('sam@corp.io wants to edit this diagram')
        ).toBeTruthy();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
        });
        expect(api.answerPoke).toHaveBeenCalledExactlyOnceWith(
            'r1',
            'p1',
            'tab-1',
            false
        );
        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).toBeNull()
        );
        expect(screen.getByText('status:editor')).toBeTruthy();
        expect(api.releaseLock).not.toHaveBeenCalled();
    });

    it('turns the editor read-only, naming who has the diagram now, when it agrees', async () => {
        await open();
        act(() => stream().emit('poke', request));
        await act(async () => {
            fireEvent.click(
                await screen.findByRole('button', {
                    name: 'Agree and step out',
                })
            );
        });
        expect(api.answerPoke).toHaveBeenCalledExactlyOnceWith(
            'r1',
            'p1',
            'tab-1',
            true
        );
        expect(await screen.findByText('status:taken')).toBeTruthy();
        expect(screen.getByText('holder:sam@corp.io')).toBeTruthy();
        expect(screen.queryByRole('alertdialog')).toBeNull();
        // the lock went to the other editor with the answer: nothing to give back
        expect(api.releaseLock).not.toHaveBeenCalled();
    });

    it('does not show the request to an editor that is only waiting for the diagram', async () => {
        api.acquireLock.mockResolvedValue({
            held: false,
            holder: 'kim@corp.io',
        });
        await open();
        expect(screen.getByText('status:taken')).toBeTruthy();
        // it still listens: the answer to its own request comes on this stream
        expect(FakeEventSource.instances).toHaveLength(1);
        act(() => stream().emit('poke', request));
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('opens no stream for someone who may only view', async () => {
        api.getDiagramSummary.mockResolvedValue(summary({ role: 'viewer' }));
        await open();
        expect(screen.getByText('status:viewer')).toBeTruthy();
        expect(FakeEventSource.instances).toHaveLength(0);
    });

    it('lets the stream go when the editor is closed', async () => {
        const view = await open();
        const first = stream();
        view.unmount();
        expect(first.closed).toBe(true);
    });
});
