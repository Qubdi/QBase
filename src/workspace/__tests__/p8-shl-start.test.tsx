import React from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import {
    MemoryRouter,
    Route,
    Routes,
    useLocation,
    useNavigate,
} from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { blank } from '@/core/testing/helpers';
import { MemoryStorageAdapter } from '@/persistence/memory-adapter';
import { DiagramProvider } from '@/qbase/diagram-provider';
import { localDiagramsOver } from '@/qbase/local-diagrams';
import { StorageContext } from '@/qbase/storage-context';
import { selectCanUndo } from '@/store/selectors';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import { RememberDefault } from '../remember-default';

const named = (name: string) => ({ ...blank(), id: `id-${name}`, name });

const Editor: React.FC = () => {
    const name = useEditorStore((s) => s.design.name);
    const canUndo = useEditorStore(selectCanUndo);
    const store = useEditorStoreApi();
    const go = useNavigate();
    return (
        <div>
            <span>open:{name}</span>
            <span>undo:{String(canUndo)}</span>
            <button
                onClick={() =>
                    store
                        .getState()
                        .edit({ type: 'design.rename', name: 'Edited' })
                }
            >
                edit
            </button>
            <button onClick={() => go('/diagrams/id-B')}>go-b</button>
            <RememberDefault />
        </div>
    );
};

const Where: React.FC = () => (
    <div data-testid="where">{useLocation().pathname}</div>
);

const app = (adapter: MemoryStorageAdapter, path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <StorageContext.Provider
                value={{ adapter, diagrams: localDiagramsOver(adapter) }}
            >
                <Where />
                <Routes>
                    {['/', '/diagrams/:diagramId'].map((p) => (
                        <Route
                            key={p}
                            path={p}
                            element={
                                <DiagramProvider
                                    fallback={<div>nothing to open</div>}
                                >
                                    <Editor />
                                </DiagramProvider>
                            }
                        />
                    ))}
                </Routes>
            </StorageContext.Provider>
        </MemoryRouter>
    );

describe('start-up in local mode (SHL-020 to SHL-024)', () => {
    it('SHL-020: / with a remembered default goes to /diagrams/<id>', async () => {
        const adapter = new MemoryStorageAdapter();
        await adapter.save(named('A'));
        await adapter.save(named('B'));
        await adapter.writeSettings({ defaultDiagramId: 'id-B' });
        app(adapter, '/');
        expect(await screen.findByText('open:B')).toBeTruthy();
        await waitFor(() =>
            expect(screen.getByTestId('where').textContent).toBe(
                '/diagrams/id-B'
            )
        );
    });

    it('SHL-021: no default but diagrams stored opens none of them, so the Open dialog can ask', async () => {
        const adapter = new MemoryStorageAdapter();
        await adapter.save(named('A'));
        await adapter.save(named('B'));
        await adapter.writeSettings({ defaultDiagramId: '' });
        app(adapter, '/');
        expect(await screen.findByText('nothing to open')).toBeTruthy();
        expect(screen.queryByText(/open:/)).toBeNull();
    });

    it('SHL-021: a default that points to a deleted diagram is not usable either', async () => {
        const adapter = new MemoryStorageAdapter();
        await adapter.save(named('A'));
        await adapter.writeSettings({ defaultDiagramId: 'id-gone' });
        app(adapter, '/');
        expect(await screen.findByText('nothing to open')).toBeTruthy();
    });

    it('SHL-023: a spinner shows while the diagram loads', async () => {
        const adapter = new MemoryStorageAdapter();
        await adapter.save(named('A'));
        const real = adapter.load.bind(adapter);
        let release: () => void = () => undefined;
        adapter.load = (id: string) =>
            new Promise((resolve) => {
                release = () => resolve(real(id));
            });
        const { container } = app(adapter, '/diagrams/id-A');
        expect(container.querySelector('[role="status"]')).toBeTruthy();
        expect(screen.queryByText('open:A')).toBeNull();
        await act(async () => release());
        expect(await screen.findByText('open:A')).toBeTruthy();
        expect(container.querySelector('[role="status"]')).toBeNull();
    });

    it('SHL-023: an unknown id falls back to the start flow', async () => {
        const adapter = new MemoryStorageAdapter();
        await adapter.save(named('A'));
        app(adapter, '/diagrams/nope');
        expect(await screen.findByText('nothing to open')).toBeTruthy();
    });

    it('SHL-023: undo and redo history is cleared when another diagram opens', async () => {
        const adapter = new MemoryStorageAdapter();
        await adapter.save(named('A'));
        await adapter.save(named('B'));
        app(adapter, '/diagrams/id-A');
        await screen.findByText('open:A');
        expect(screen.getByText('undo:false')).toBeTruthy();
        fireEvent.click(screen.getByText('edit'));
        expect(screen.getByText('undo:true')).toBeTruthy();
        fireEvent.click(screen.getByText('go-b'));
        expect(await screen.findByText('open:B')).toBeTruthy();
        expect(screen.getByText('undo:false')).toBeTruthy();
    });

    it('SHL-024: opening a diagram by its address makes it the default', async () => {
        const adapter = new MemoryStorageAdapter();
        await adapter.save(named('A'));
        await adapter.save(named('B'));
        await adapter.writeSettings({ defaultDiagramId: 'id-A' });
        app(adapter, '/diagrams/id-B');
        await screen.findByText('open:B');
        await waitFor(async () =>
            expect((await adapter.readSettings()).defaultDiagramId).toBe('id-B')
        );
    });
});

describe('the first screen waits for the language (SHL-019)', () => {
    const start = async (ready: Promise<unknown>) => {
        vi.resetModules();
        document.body.innerHTML = '<main id="root"></main>';
        vi.doMock('@/i18n/i18n', () => ({ i18nReady: ready }));
        vi.doMock('../../app', () => ({
            App: () => <div>app started</div>,
        }));
        vi.doMock('@/qbase/dialect-types', () => ({
            provideDialectTypes: () => undefined,
        }));
        await import('../../main');
    };

    it('renders only after the language has loaded', async () => {
        let ready: () => void = () => undefined;
        await start(new Promise<void>((resolve) => (ready = resolve)));
        await new Promise((r) => setTimeout(r, 30));
        expect(document.body.textContent).not.toContain('app started');
        ready();
        await waitFor(() =>
            expect(document.body.textContent).toContain('app started')
        );
    });

    it('starts anyway (English) when the language fails to load', async () => {
        const failed = Promise.reject(new Error('no network'));
        failed.catch(() => undefined);
        await start(failed);
        await waitFor(() =>
            expect(document.body.textContent).toContain('app started')
        );
    });
});
