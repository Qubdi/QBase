import React, { Suspense, lazy, useMemo, useReducer } from 'react';
import { useTheme } from '@/platform/theme/theme-context';
import { toast } from '@/platform/toast/use-toast';
import { useWorkspace } from '@/components/qubdi/workspace-context';
import type { DatabaseType } from '@/core/model/database';
import type { ImageFormat } from '@/formats/image/export-options';
import { useTranslation } from 'react-i18next';
import { useCanvasActions } from '@/workspace/canvas-bridge-context';
import { SHORTCUTS, shortcutLabel } from '@/workspace/shortcuts';
import { getOperatingSystem } from '@/lib/utils/utils';
import { useStorageAdapter } from '@/qbase/storage-context';
import { useOptionalEditorStoreApi } from '@/store/store-context';
import { DialogContext } from './dialog-context';
import type {
    DialogApi,
    ImportIntoOpenOptions,
    OpenDiagramOptions,
} from './dialog-context';

// The dialogs are separate chunks. The create and import dialogs reach the
// DBML parser, the heaviest part of the editor, so they may only be loaded
// here with import() (see src/__tests__/lazy-dbml.test.ts).
const CreateDiagramDialog = lazy(() =>
    import('@/dialogs/create-diagram-dialog/create-diagram-dialog').then(
        (m) => ({ default: m.CreateDiagramDialog })
    )
);
const ExamplesDialog = lazy(() =>
    import('@/features/examples/examples-dialog').then((m) => ({
        default: m.ExamplesDialog,
    }))
);
const ImportDatabaseDialog = lazy(() =>
    import('@/dialogs/import-database-dialog/import-database-dialog').then(
        (m) => ({ default: m.ImportDatabaseDialog })
    )
);
const ImportDiagramDialog = lazy(() =>
    import('@/dialogs/import-diagram-dialog/import-diagram-dialog').then(
        (m) => ({ default: m.ImportDiagramDialog })
    )
);
const OpenDesignDialog = lazy(() =>
    import('@/features/designs/open-design-dialog').then((m) => ({
        default: m.OpenDesignDialog,
    }))
);
const ClearDesignDialog = lazy(() =>
    import('@/features/designs/clear-design-dialog').then((m) => ({
        default: m.ClearDesignDialog,
    }))
);
const DeleteOpenDesignDialog = lazy(() =>
    import('@/features/designs/delete-open-design-dialog').then((m) => ({
        default: m.DeleteOpenDesignDialog,
    }))
);
const ExportSqlDialog = lazy(() =>
    import('@/features/export/export-sql-dialog').then((m) => ({
        default: m.ExportSqlDialog,
    }))
);
const ExportJsonDialog = lazy(() =>
    import('@/features/export/export-json-dialog').then((m) => ({
        default: m.ExportJsonDialog,
    }))
);
const ExportImageDialog = lazy(() =>
    import('@/features/export/export-image-dialog').then((m) => ({
        default: m.ExportImageDialog,
    }))
);
const SettingsDialog = lazy(() =>
    import('@/features/settings/settings-dialog').then((m) => ({
        default: m.SettingsDialog,
    }))
);
const ProjectCreateDialog = lazy(() =>
    import('@/components/qubdi/project-create-dialog').then((m) => ({
        default: m.ProjectCreateDialog,
    }))
);
const ProjectOpenDialog = lazy(() =>
    import('@/components/qubdi/project-open-dialog').then((m) => ({
        default: m.ProjectOpenDialog,
    }))
);

interface Open {
    create: boolean;
    examples: boolean;
    open?: Required<OpenDiagramOptions>;
    importFile: boolean;
    importDatabase?: ImportIntoOpenOptions;
    exportSql?: DatabaseType;
    exportJson: boolean;
    exportImage?: Exclude<ImageFormat, 'svg'>;
    settings: boolean;
    clear: boolean;
    remove: boolean;
}

const NONE: Open = {
    create: false,
    examples: false,
    importFile: false,
    exportJson: false,
    settings: false,
    clear: false,
    remove: false,
};

type Action = { set: Partial<Open> };
const reduce = (state: Open, action: Action): Open => ({
    ...state,
    ...action.set,
});

/**
 * Holds which dialog is open and renders it. Inside a project the create and
 * open requests show the QBase project dialogs instead of the local ones
 * (spec B2, P9). Place it inside the page's storage provider; the export,
 * import-into-diagram, clear and delete dialogs need an open editor and are
 * not shown without one.
 */
export const DialogProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const { t } = useTranslation();
    const [open, dispatch] = useReducer(reduce, NONE);
    const workspace = useWorkspace();
    const adapter = useStorageAdapter();
    const store = useOptionalEditorStoreApi();
    const canvas = useCanvasActions();
    const { resolvedTheme } = useTheme();

    const api = useMemo<DialogApi>(() => {
        const set = (partial: Partial<Open>) => dispatch({ set: partial });
        return {
            openCreateDiagramDialog: () =>
                set({ create: true, open: undefined }),
            closeCreateDiagramDialog: () => set({ create: false }),
            openExamplesDialog: () => set({ examples: true }),
            closeExamplesDialog: () => set({ examples: false }),
            openOpenDiagramDialog: (o) =>
                set({ open: { canClose: o?.canClose ?? true } }),
            closeOpenDiagramDialog: () => set({ open: undefined }),
            openImportDiagramDialog: () => set({ importFile: true }),
            closeImportDiagramDialog: () => set({ importFile: false }),
            openImportDatabaseDialog: (o) => set({ importDatabase: o ?? {} }),
            closeImportDatabaseDialog: () => set({ importDatabase: undefined }),
            openExportSqlDialog: (target) => set({ exportSql: target }),
            closeExportSqlDialog: () => set({ exportSql: undefined }),
            openExportJsonDialog: () => set({ exportJson: true }),
            closeExportJsonDialog: () => set({ exportJson: false }),
            openExportImageDialog: (format) => {
                if (format !== 'svg') return set({ exportImage: format });
                // SVG goes out at once, with fixed options (spec A6)
                if (!store) return;
                // the picture code is only fetched when an image is made
                void import('@/features/export/run-image-export').then(
                    ({ CaptureError, runImageExport }) =>
                        runImageExport({
                            format,
                            design: store.getState().design,
                            theme: resolvedTheme,
                            getTarget: canvas.captureTarget,
                            prepare: () => store.getState().select([]),
                        }).catch((error: unknown) =>
                            toast({
                                title: t(
                                    error instanceof CaptureError &&
                                        error.reason === 'empty'
                                        ? 'editor.exporting.image.empty'
                                        : 'editor.exporting.image.failed'
                                ),
                                variant: 'destructive',
                            })
                        )
                );
            },
            closeExportImageDialog: () => set({ exportImage: undefined }),
            openSettingsDialog: () => set({ settings: true }),
            closeSettingsDialog: () => set({ settings: false }),
            openClearDiagramDialog: () => set({ clear: true }),
            closeClearDiagramDialog: () => set({ clear: false }),
            openDeleteDiagramDialog: () => set({ remove: true }),
            closeDeleteDiagramDialog: () => set({ remove: false }),
        };
    }, [store, canvas, resolvedTheme, t]);

    const mac = getOperatingSystem() === 'mac';
    const shortcutRows = useMemo(
        () =>
            SHORTCUTS.map((s) => ({
                label: t(`editor.workspace.shortcuts.${s.id}`),
                keys: shortcutLabel(s, mac),
            })),
        [t, mac]
    );

    return (
        <DialogContext.Provider value={api}>
            {children}
            <Suspense fallback={null}>
                {workspace ? (
                    <>
                        {open.create ? (
                            <ProjectCreateDialog
                                open
                                project={workspace.project}
                                onClose={api.closeCreateDiagramDialog}
                            />
                        ) : null}
                        {open.open ? (
                            <ProjectOpenDialog
                                open
                                project={workspace.project}
                                canClose={open.open.canClose}
                                onClose={api.closeOpenDiagramDialog}
                                onCreate={() => {
                                    api.closeOpenDiagramDialog();
                                    api.openCreateDiagramDialog();
                                }}
                            />
                        ) : null}
                    </>
                ) : (
                    <>
                        {open.create ? (
                            <CreateDiagramDialog dialog={{ open: true }} />
                        ) : null}
                        {open.open ? (
                            <OpenDesignDialog
                                open
                                adapter={adapter}
                                store={store}
                                canClose={open.open.canClose}
                                onClose={api.closeOpenDiagramDialog}
                                onCreate={() => {
                                    api.closeOpenDiagramDialog();
                                    api.openCreateDiagramDialog();
                                }}
                            />
                        ) : null}
                    </>
                )}
                {open.examples ? (
                    <ExamplesDialog onClose={api.closeExamplesDialog} />
                ) : null}
                {open.importFile ? (
                    <ImportDiagramDialog dialog={{ open: true }} />
                ) : null}
                {store ? (
                    <>
                        {open.importDatabase ? (
                            <ImportDatabaseDialog
                                dialog={{ open: true, ...open.importDatabase }}
                            />
                        ) : null}
                        {open.exportSql ? (
                            <ExportSqlDialog
                                target={open.exportSql}
                                onClose={api.closeExportSqlDialog}
                            />
                        ) : null}
                        {open.exportJson ? (
                            <ExportJsonDialog
                                open
                                onClose={api.closeExportJsonDialog}
                            />
                        ) : null}
                        {open.exportImage ? (
                            <ExportImageDialog
                                format={open.exportImage}
                                getTarget={canvas.captureTarget}
                                onClose={api.closeExportImageDialog}
                            />
                        ) : null}
                        {open.clear ? (
                            <ClearDesignDialog
                                open
                                onClose={api.closeClearDiagramDialog}
                            />
                        ) : null}
                        {open.remove ? (
                            <DeleteOpenDesignDialog
                                open
                                onClose={api.closeDeleteDiagramDialog}
                            />
                        ) : null}
                    </>
                ) : null}
                {open.settings ? (
                    <SettingsDialog
                        open
                        shortcuts={shortcutRows}
                        onClose={api.closeSettingsDialog}
                    />
                ) : null}
            </Suspense>
        </DialogContext.Provider>
    );
};
