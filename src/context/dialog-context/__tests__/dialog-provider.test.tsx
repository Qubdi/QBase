import React, { useEffect } from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withTables } from '@/core/testing/helpers';
import { createEditorStore } from '@/store/editor-store';
import type { EditorStore } from '@/store/editor-store';
import { SHORTCUTS } from '@/workspace/shortcuts';
import { CaptureError } from '@/features/export/capture-image';
import type { DialogApi } from '../dialog-context';

// what is around the provider, switched per test
const env = vi.hoisted(() => ({
    store: null as EditorStore | null,
    workspace: null as null | { project: { id: string; name: string } },
    target: null as HTMLElement | null,
}));
vi.mock('@/store/store-context', () => ({
    useOptionalEditorStoreApi: () => env.store,
}));
vi.mock('@/components/qubdi/workspace-context', () => ({
    useWorkspace: () => env.workspace,
}));
vi.mock('@/qbase/storage-context', () => ({
    useStorageAdapter: () => ({ name: 'adapter' }),
}));
vi.mock('@/workspace/canvas-bridge-context', () => ({
    useCanvasActions: () => ({ captureTarget: () => env.target }),
}));
vi.mock('@/platform/theme/theme-context', () => ({
    useTheme: () => ({ resolvedTheme: 'dark' }),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/platform/toast/use-toast', () => ({ toast }));
const runImageExport = vi.hoisted(() => vi.fn());
vi.mock('@/features/export/run-image-export', async () => ({
    CaptureError: (await import('@/features/export/capture-image'))
        .CaptureError,
    runImageExport,
}));

// Each dialog is a stub that shows what it was given and offers its callbacks.
type Props = Record<string, unknown>;
const stub = (name: string) => {
    const Stub = (props: Props) => (
        <div data-testid={name} data-props={JSON.stringify(props)}>
            {Object.entries(props)
                .filter(([, v]) => typeof v === 'function')
                .map(([k, v]) => (
                    <button key={k} onClick={() => (v as () => void)()}>
                        {`${name}.${k}`}
                    </button>
                ))}
        </div>
    );
    Stub.displayName = name;
    return Stub;
};
vi.mock('@/dialogs/create-diagram-dialog/create-diagram-dialog', () => ({
    CreateDiagramDialog: stub('create'),
}));
vi.mock('@/features/examples/examples-dialog', () => ({
    ExamplesDialog: stub('examples'),
}));
vi.mock('@/dialogs/import-database-dialog/import-database-dialog', () => ({
    ImportDatabaseDialog: stub('import-database'),
}));
vi.mock('@/dialogs/import-diagram-dialog/import-diagram-dialog', () => ({
    ImportDiagramDialog: stub('import-file'),
}));
vi.mock('@/features/designs/open-design-dialog', () => ({
    OpenDesignDialog: stub('open'),
}));
vi.mock('@/features/designs/clear-design-dialog', () => ({
    ClearDesignDialog: stub('clear'),
}));
vi.mock('@/features/designs/delete-open-design-dialog', () => ({
    DeleteOpenDesignDialog: stub('delete'),
}));
vi.mock('@/features/export/export-sql-dialog', () => ({
    ExportSqlDialog: stub('export-sql'),
}));
vi.mock('@/features/export/export-json-dialog', () => ({
    ExportJsonDialog: stub('export-json'),
}));
vi.mock('@/features/export/export-image-dialog', () => ({
    ExportImageDialog: stub('export-image'),
}));
vi.mock('@/features/settings/settings-dialog', () => ({
    SettingsDialog: stub('settings'),
}));
vi.mock('@/components/qubdi/project-create-dialog', () => ({
    ProjectCreateDialog: stub('project-create'),
}));
vi.mock('@/components/qubdi/project-open-dialog', () => ({
    ProjectOpenDialog: stub('project-open'),
}));

import { useDialog } from '@/hooks/use-dialog';
import { DialogProvider } from '../dialog-provider';

const held: { api?: DialogApi } = {};
const Grab: React.FC = () => {
    const value = useDialog();
    useEffect(() => {
        held.api = value;
    });
    return null;
};
const api = () => held.api!;

const mount = () =>
    render(
        <MemoryRouter initialEntries={['/diagrams/x']}>
            <DialogProvider>
                <Grab />
            </DialogProvider>
        </MemoryRouter>
    );

/** Calls the api in act, then waits for the lazy dialog. */
const open = async (call: (a: DialogApi) => void, testId: string) => {
    act(() => call(api()));
    return screen.findByTestId(testId);
};
const propsOf = (el: HTMLElement) =>
    JSON.parse(el.getAttribute('data-props')!) as Props;

beforeEach(() => {
    env.store = createEditorStore({ design: withTables(['users']) });
    env.workspace = null;
    env.target = document.createElement('div');
    toast.mockReset();
    runImageExport.mockReset().mockResolvedValue(undefined);
});

describe('DialogProvider with an open diagram', () => {
    it.each([
        ['openExamplesDialog', 'closeExamplesDialog', 'examples'],
        ['openImportDiagramDialog', 'closeImportDiagramDialog', 'import-file'],
        [
            'openImportDatabaseDialog',
            'closeImportDatabaseDialog',
            'import-database',
        ],
        ['openExportJsonDialog', 'closeExportJsonDialog', 'export-json'],
        ['openSettingsDialog', 'closeSettingsDialog', 'settings'],
        ['openClearDiagramDialog', 'closeClearDiagramDialog', 'clear'],
        ['openDeleteDiagramDialog', 'closeDeleteDiagramDialog', 'delete'],
        ['openCreateDiagramDialog', 'closeCreateDiagramDialog', 'create'],
        ['openOpenDiagramDialog', 'closeOpenDiagramDialog', 'open'],
    ] as const)(
        '%s shows the dialog and %s hides it',
        async (opener, closer, id) => {
            mount();
            expect(screen.queryByTestId(id)).toBeNull();
            await open((a) => a[opener](), id);
            act(() => api()[closer]());
            expect(screen.queryByTestId(id)).toBeNull();
        }
    );

    it('the SQL export gets the target database and closes itself', async () => {
        mount();
        const el = await open(
            (a) => a.openExportSqlDialog('mysql'),
            'export-sql'
        );
        expect(propsOf(el).target).toBe('mysql');
        fireEvent.click(screen.getByText('export-sql.onClose'));
        expect(screen.queryByTestId('export-sql')).toBeNull();
    });

    it('PNG and JPEG open the image dialog with the format and the canvas', async () => {
        mount();
        const el = await open(
            (a) => a.openExportImageDialog('jpeg'),
            'export-image'
        );
        expect(propsOf(el).format).toBe('jpeg');
        expect(runImageExport).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('export-image.onClose'));
        expect(screen.queryByTestId('export-image')).toBeNull();
    });

    it('the database import gets the allowed methods, and an empty set of options by default', async () => {
        mount();
        let el = await open(
            (a) =>
                a.openImportDatabaseDialog({
                    methods: ['dbml'],
                    initial: 'dbml',
                }),
            'import-database'
        );
        expect(propsOf(el).dialog).toEqual({
            open: true,
            methods: ['dbml'],
            initial: 'dbml',
        });
        act(() => api().closeImportDatabaseDialog());
        el = await open((a) => a.openImportDatabaseDialog(), 'import-database');
        expect(propsOf(el).dialog).toEqual({ open: true });
    });

    it('the open dialog can be closed unless told otherwise, and its Create goes to the create dialog', async () => {
        mount();
        let el = await open((a) => a.openOpenDiagramDialog(), 'open');
        expect(propsOf(el).canClose).toBe(true);
        act(() => api().closeOpenDiagramDialog());
        el = await open(
            (a) => a.openOpenDiagramDialog({ canClose: false }),
            'open'
        );
        expect(propsOf(el).canClose).toBe(false);
        fireEvent.click(screen.getByText('open.onCreate'));
        expect(await screen.findByTestId('create')).toBeInTheDocument();
        expect(screen.queryByTestId('open')).toBeNull();
    });

    it('opening the create dialog closes an open dialog that was showing', async () => {
        mount();
        await open((a) => a.openOpenDiagramDialog(), 'open');
        await open((a) => a.openCreateDiagramDialog(), 'create');
        expect(screen.queryByTestId('open')).toBeNull();
    });

    it('the settings list every shortcut with a translated label and its keys', async () => {
        mount();
        const el = await open((a) => a.openSettingsDialog(), 'settings');
        const rows = propsOf(el).shortcuts as { label: string; keys: string }[];
        expect(rows).toHaveLength(SHORTCUTS.length);
        for (const row of rows) {
            expect(row.label).not.toMatch(/^editor\./);
            expect(row.keys).not.toBe('');
        }
    });

    it('the examples close on their own and when backed out of, staying on the page', async () => {
        mount();
        await open((a) => a.openExamplesDialog(), 'examples');
        fireEvent.click(screen.getByText('examples.onDismiss'));
        expect(screen.queryByTestId('examples')).toBeNull();
        await open((a) => a.openExamplesDialog(), 'examples');
        fireEvent.click(screen.getByText('examples.onClose'));
        expect(screen.queryByTestId('examples')).toBeNull();
    });
});

describe('the SVG export, which goes out at once', () => {
    it('exports the diagram with the page theme and the canvas, after clearing the selection', async () => {
        const store = env.store!;
        store.getState().select([store.getState().design.entities.order[0]]);
        mount();
        act(() => api().openExportImageDialog('svg'));
        await waitFor(() => expect(runImageExport).toHaveBeenCalledTimes(1));
        const request = runImageExport.mock.calls[0][0];
        expect(request.format).toBe('svg');
        expect(request.theme).toBe('dark');
        expect(request.design).toBe(store.getState().design);
        expect(request.getTarget()).toBe(env.target);
        request.prepare();
        expect(store.getState().ui.selection).toEqual([]);
        // no dialog for SVG
        expect(screen.queryByTestId('export-image')).toBeNull();
        expect(toast).not.toHaveBeenCalled();
    });

    it('says there is nothing to draw for an empty diagram', async () => {
        runImageExport.mockRejectedValue(new CaptureError('empty'));
        mount();
        act(() => api().openExportImageDialog('svg'));
        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith({
                title: 'There is nothing to put in the picture yet',
                variant: 'destructive',
            })
        );
    });

    it.each([
        ['a capture failure', new CaptureError('failed')],
        ['an unexpected error', new Error('boom')],
    ])('says the image could not be made after %s', async (_, error) => {
        runImageExport.mockRejectedValue(error);
        mount();
        act(() => api().openExportImageDialog('svg'));
        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith({
                title: 'The image could not be created',
                variant: 'destructive',
            })
        );
    });

    it('does nothing without an open diagram', async () => {
        env.store = null;
        mount();
        act(() => api().openExportImageDialog('svg'));
        await new Promise((r) => setTimeout(r, 20));
        expect(runImageExport).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
    });
});

describe('DialogProvider without an open diagram', () => {
    beforeEach(() => {
        env.store = null;
    });

    it.each([
        ['openImportDatabaseDialog', 'import-database'],
        ['openExportJsonDialog', 'export-json'],
        ['openClearDiagramDialog', 'clear'],
        ['openDeleteDiagramDialog', 'delete'],
    ] as const)(
        '%s shows nothing, since it needs a diagram',
        async (opener, id) => {
            mount();
            act(() => api()[opener]());
            // the dialogs that do not need a diagram still come up
            await open((a) => a.openSettingsDialog(), 'settings');
            expect(screen.queryByTestId(id)).toBeNull();
        }
    );

    it('the SQL and image exports need a diagram too', async () => {
        mount();
        act(() => {
            api().openExportSqlDialog('postgresql');
            api().openExportImageDialog('png');
        });
        await open((a) => a.openImportDiagramDialog(), 'import-file');
        expect(screen.queryByTestId('export-sql')).toBeNull();
        expect(screen.queryByTestId('export-image')).toBeNull();
    });

    it('the local open dialog is given the storage adapter and no store', async () => {
        mount();
        const el = await open((a) => a.openOpenDiagramDialog(), 'open');
        expect(propsOf(el).adapter).toEqual({ name: 'adapter' });
        expect(propsOf(el).store).toBeNull();
    });
});

describe('DialogProvider inside a project', () => {
    beforeEach(() => {
        env.workspace = { project: { id: 'p1', name: 'Shop' } };
    });

    it('create and open show the project dialogs instead of the local ones', async () => {
        mount();
        const create = await open(
            (a) => a.openCreateDiagramDialog(),
            'project-create'
        );
        expect(propsOf(create).project).toEqual(env.workspace!.project);
        expect(screen.queryByTestId('create')).toBeNull();
        act(() => api().closeCreateDiagramDialog());
        const opened = await open(
            (a) => a.openOpenDiagramDialog({ canClose: false }),
            'project-open'
        );
        expect(propsOf(opened).project).toEqual(env.workspace!.project);
        expect(screen.queryByTestId('open')).toBeNull();
    });

    it('the project open dialog goes to the project create dialog', async () => {
        mount();
        await open((a) => a.openOpenDiagramDialog(), 'project-open');
        fireEvent.click(screen.getByText('project-open.onCreate'));
        expect(await screen.findByTestId('project-create')).toBeInTheDocument();
        expect(screen.queryByTestId('project-open')).toBeNull();
    });

    it('closing a project dialog with a diagram open behind it only closes it', async () => {
        mount();
        await open((a) => a.openOpenDiagramDialog(), 'project-open');
        fireEvent.click(screen.getByText('project-open.onClose'));
        expect(screen.queryByTestId('project-open')).toBeNull();
        await open((a) => a.openCreateDiagramDialog(), 'project-create');
        fireEvent.click(screen.getByText('project-create.onClose'));
        expect(screen.queryByTestId('project-create')).toBeNull();
    });
});

describe('without a provider', () => {
    it('every call says the provider is missing', () => {
        render(<Grab />);
        expect(() => api().openSettingsDialog()).toThrow(
            'No dialog provider: wrap the editor in DialogProvider'
        );
    });
});
