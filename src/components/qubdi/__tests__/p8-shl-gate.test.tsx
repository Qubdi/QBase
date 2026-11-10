import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import { ApiError } from '@/lib/qubdi/api';
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

const api = vi.hoisted(() => ({
    getProject: vi.fn(),
    setupStatus: vi.fn(async () => ({ needsSetup: false, signupOpen: false })),
    getDiagramSummary: vi.fn(),
    getDiagram: vi.fn(),
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
}));
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api,
}));
vi.mock('../use-edit-lock', () => ({
    useEditLock: () => ({ status: 'held' }),
}));

const project: MyProject = {
    id: 'p1',
    name: 'Billing',
    slug: 'Billing',
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

const Where: React.FC = () => (
    <div data-testid="where">{useLocation().pathname}</div>
);
const Probe: React.FC = () => (
    <div>status:{useDiagramAccess().access.status}</div>
);

const show = (
    path: string,
    who: RemoteUser | null | undefined = user,
    adapter = new MemoryStorageAdapter()
) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <qubdiContext.Provider
                value={{ enabled: true, user: who } as unknown as QubdiContext}
            >
                <StorageContext.Provider
                    value={{ adapter, diagrams: localDiagramsOver(adapter) }}
                >
                    <Where />
                    <Routes>
                        {[
                            ':projectSlug/diagrams',
                            ':projectSlug/diagrams/:remoteDiagramId',
                            'diagrams/:diagramId',
                        ].map((p) => (
                            <Route
                                key={p}
                                path={p}
                                element={
                                    <DiagramAccessGate
                                        fallback={<div>start flow</div>}
                                    >
                                        <Probe />
                                    </DiagramAccessGate>
                                }
                            />
                        ))}
                        <Route path="/" element={<div>home</div>} />
                    </Routes>
                </StorageContext.Provider>
            </qubdiContext.Provider>
        </MemoryRouter>
    );

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.getProject.mockResolvedValue(project);
    api.getDiagramSummary.mockResolvedValue(summary());
});

describe('the gate when the signed-in user object is refreshed', () => {
    it('keeps what it shows and does not look the diagram up again (2FA recovery codes stay)', async () => {
        const adapter = new MemoryStorageAdapter();
        api.getDiagram.mockResolvedValue(undefined);
        const design = withTables(['a']);
        await adapter.save(design);
        setRemoteId(design.id, 'r1');
        setProjectId(design.id, 'p1');
        const tree = (who: RemoteUser) => (
            <MemoryRouter initialEntries={['/billing/diagrams/r1']}>
                <qubdiContext.Provider
                    value={
                        { enabled: true, user: who } as unknown as QubdiContext
                    }
                >
                    <StorageContext.Provider
                        value={{
                            adapter,
                            diagrams: localDiagramsOver(adapter),
                        }}
                    >
                        <Routes>
                            <Route
                                path=":projectSlug/diagrams/:remoteDiagramId"
                                element={
                                    <DiagramAccessGate
                                        fallback={<div>start flow</div>}
                                    >
                                        <Probe />
                                    </DiagramAccessGate>
                                }
                            />
                        </Routes>
                    </StorageContext.Provider>
                </qubdiContext.Provider>
            </MemoryRouter>
        );
        const view = render(tree(user));
        expect(await screen.findByText(/^status:/)).toBeTruthy();
        const lookups = api.getProject.mock.calls.length;
        // the same person, a new object: what turning two-factor on does
        view.rerender(tree({ ...user, mfaEnabled: true } as RemoteUser));
        // still showing the page, not back at "loading"
        expect(screen.getByText(/^status:/)).toBeTruthy();
        await new Promise((r) => setTimeout(r, 30));
        expect(screen.getByText(/^status:/)).toBeTruthy();
        expect(api.getProject.mock.calls.length).toBe(lookups);
    });
});

describe('the project editor gate (SHL-016, SHL-111)', () => {
    it('SHL-016: a diagram of another project shows "not found", never the diagram', async () => {
        api.getDiagramSummary.mockResolvedValue(
            summary({ projectId: 'other' })
        );
        show('/billing/diagrams/r1');
        expect(await screen.findByText('Diagram not found')).toBeTruthy();
        expect(screen.queryByText(/status:/)).toBeNull();
        // the diagram was never downloaded
        expect(api.getDiagram).not.toHaveBeenCalled();
    });

    it('SHL-111: signed out, it asks for a sign-in instead of opening the editor', async () => {
        show('/billing/diagrams/r1', null);
        expect(
            await screen.findByRole('button', { name: /sign in/i })
        ).toBeTruthy();
        expect(screen.queryByText(/status:/)).toBeNull();
        expect(api.getProject).not.toHaveBeenCalled();
    });

    it('SHL-111: an unknown project shows "Project not found" and a Back to projects button', async () => {
        api.getProject.mockRejectedValue(new ApiError(404, 'not found'));
        show('/nope/diagrams/r1');
        expect(await screen.findByText('Project not found')).toBeTruthy();
        const back = screen.getByRole('link', { name: 'Back to projects' });
        expect(back.getAttribute('href')).toBe('/');
    });

    it('SHL-111: a diagram the server does not have shows "Diagram not found"', async () => {
        api.getDiagramSummary.mockRejectedValue(new ApiError(404, 'gone'));
        show('/billing/diagrams/r1');
        expect(await screen.findByText('Diagram not found')).toBeTruthy();
        // nothing to retry: the diagram is gone
        expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
        expect(
            screen.getByRole('link', { name: 'Back to projects' })
        ).toBeTruthy();
    });

    it('SHL-111: any other failure shows the open-failed screen with the reason', async () => {
        api.getDiagramSummary.mockRejectedValue(
            new ApiError(423, 'locked', 'raw server text')
        );
        show('/billing/diagrams/r1');
        expect(
            await screen.findByText('Could not open this diagram')
        ).toBeTruthy();
        expect(
            screen.getByText('Someone else is editing this diagram.')
        ).toBeTruthy();
        // a failure may be passing (a dropped connection): offer to try again
        expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
        expect(
            screen.getByRole('link', { name: 'Back to projects' })
        ).toBeTruthy();
    });

    it('a diagram of the project opens, with editor access', async () => {
        const adapter = new MemoryStorageAdapter();
        api.getDiagram.mockResolvedValue(undefined);
        // a local copy already bound to the server diagram
        const design = withTables(['a']);
        await adapter.save(design);
        setRemoteId(design.id, 'r1');
        setProjectId(design.id, 'p1');
        show('/billing/diagrams/r1', user, adapter);
        await waitFor(() =>
            expect(screen.queryByText('Diagram not found')).toBeNull()
        );
        expect(screen.queryByText('Project not found')).toBeNull();
    });
});

describe('an old /diagrams/<id> link (SHL-113)', () => {
    it('goes to the project URL when the diagram is bound to a project', async () => {
        const adapter = new MemoryStorageAdapter();
        const design = withTables(['a']);
        await adapter.save(design);
        setRemoteId(design.id, 'r1');
        setProjectId(design.id, 'p1');
        show(`/diagrams/${design.id}`, user, adapter);
        await waitFor(() =>
            expect(screen.getByTestId('where').textContent).toBe(
                '/Billing/diagrams/r1'
            )
        );
    });

    it('opens read-only as "unbound" when it belongs to no project', async () => {
        const adapter = new MemoryStorageAdapter();
        const design = withTables(['a']);
        await adapter.save(design);
        show(`/diagrams/${design.id}`, user, adapter);
        expect(await screen.findByText('status:unbound')).toBeTruthy();
        expect(screen.getByTestId('where').textContent).toBe(
            `/diagrams/${design.id}`
        );
    });
});
