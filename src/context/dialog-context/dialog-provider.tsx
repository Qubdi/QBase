import React, { Suspense, useCallback, useState } from 'react';
import type { DialogContext } from './dialog-context';
import { dialogContext } from './dialog-context';
import type { CreateDiagramDialogProps } from '@/dialogs/create-diagram-dialog/create-diagram-dialog';
import type { OpenDiagramDialogProps } from '@/dialogs/open-diagram-dialog/open-diagram-dialog';
import { OpenDiagramDialog } from '@/dialogs/open-diagram-dialog/open-diagram-dialog';
import { ProjectCreateDialog } from '@/components/qubdi/project-create-dialog';
import { ProjectOpenDialog } from '@/components/qubdi/project-open-dialog';
import { useWorkspace } from '@/components/qubdi/workspace-context';
import type { ExportSQLDialogProps } from '@/dialogs/export-sql-dialog/export-sql-dialog';
import { ExportSQLDialog } from '@/dialogs/export-sql-dialog/export-sql-dialog';
import { DatabaseType } from '@/lib/domain/database-type';
import type { CreateRelationshipDialogProps } from '@/dialogs/create-relationship-dialog/create-relationship-dialog';
import { CreateRelationshipDialog } from '@/dialogs/create-relationship-dialog/create-relationship-dialog';
import type { ImportDatabaseDialogProps } from '@/dialogs/import-database-dialog/import-database-dialog';
import type { TableSchemaDialogProps } from '@/dialogs/table-schema-dialog/table-schema-dialog';
import { TableSchemaDialog } from '@/dialogs/table-schema-dialog/table-schema-dialog';
import { emptyFn } from '@/lib/utils';
import type { ExportImageDialogProps } from '@/dialogs/export-image-dialog/export-image-dialog';
import { ExportImageDialog } from '@/dialogs/export-image-dialog/export-image-dialog';
import { ExportDiagramDialog } from '@/dialogs/export-diagram-dialog/export-diagram-dialog';
import { ImportDiagramDialog } from '@/dialogs/import-diagram-dialog/import-diagram-dialog';

// These two read DBML, which pulls in the whole DBML parser: they load when
// first opened, and stay mounted after that so closing can still animate.
const CreateDiagramDialog = React.lazy(() =>
    import('@/dialogs/create-diagram-dialog/create-diagram-dialog').then(
        (m) => ({ default: m.CreateDiagramDialog })
    )
);
const ImportDatabaseDialog = React.lazy(() =>
    import('@/dialogs/import-database-dialog/import-database-dialog').then(
        (m) => ({ default: m.ImportDatabaseDialog })
    )
);

/** True from the first time `open` is true on. */
const useOpenedOnce = (open: boolean): boolean => {
    const [opened, setOpened] = useState(open);
    if (open && !opened) setOpened(true);
    return opened;
};

export const DialogProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const workspace = useWorkspace();
    const [openNewDiagramDialog, setOpenNewDiagramDialog] = useState(false);
    const [newDiagramDialogParams, setNewDiagramDialogParams] =
        useState<Omit<CreateDiagramDialogProps, 'dialog'>>();
    const openNewDiagramDialogHandler: DialogContext['openCreateDiagramDialog'] =
        useCallback(
            (props) => {
                setNewDiagramDialogParams(props);
                setOpenNewDiagramDialog(true);
            },
            [setOpenNewDiagramDialog]
        );

    const [openOpenDiagramDialog, setOpenOpenDiagramDialog] = useState(false);
    const [openDiagramDialogParams, setOpenDiagramDialogParams] =
        useState<Omit<OpenDiagramDialogProps, 'dialog'>>();

    const openOpenDiagramDialogHandler: DialogContext['openOpenDiagramDialog'] =
        useCallback(
            (props) => {
                setOpenDiagramDialogParams(props);
                setOpenOpenDiagramDialog(true);
            },
            [setOpenOpenDiagramDialog]
        );

    const [openCreateRelationshipDialog, setOpenCreateRelationshipDialog] =
        useState(false);
    const [createRelationshipDialogParams, setCreateRelationshipDialogParams] =
        useState<Omit<CreateRelationshipDialogProps, 'dialog'>>();
    const openCreateRelationshipDialogHandler: DialogContext['openCreateRelationshipDialog'] =
        useCallback(
            (params) => {
                setCreateRelationshipDialogParams(params);
                setOpenCreateRelationshipDialog(true);
            },
            [setOpenCreateRelationshipDialog]
        );

    // Export image dialog
    const [openExportImageDialog, setOpenExportImageDialog] = useState(false);
    const [exportImageDialogParams, setExportImageDialogParams] = useState<
        Omit<ExportImageDialogProps, 'dialog'>
    >({ format: 'png' });
    const openExportImageDialogHandler: DialogContext['openExportImageDialog'] =
        useCallback(
            (params) => {
                setExportImageDialogParams(params);
                setOpenExportImageDialog(true);
            },
            [setOpenExportImageDialog]
        );

    // Export SQL dialog
    const [openExportSQLDialog, setOpenExportSQLDialog] = useState(false);
    const [exportSQLDialogParams, setExportSQLDialogParams] = useState<
        Omit<ExportSQLDialogProps, 'dialog'>
    >({ targetDatabaseType: DatabaseType.GENERIC });
    const openExportSQLDialogHandler: DialogContext['openExportSQLDialog'] =
        useCallback(
            ({ targetDatabaseType }) => {
                setExportSQLDialogParams({ targetDatabaseType });
                setOpenExportSQLDialog(true);
            },
            [setOpenExportSQLDialog]
        );

    // Import database dialog
    const [openImportDatabaseDialog, setOpenImportDatabaseDialog] =
        useState(false);
    const [importDatabaseDialogParams, setImportDatabaseDialogParams] =
        useState<Omit<ImportDatabaseDialogProps, 'dialog'>>({
            databaseType: DatabaseType.GENERIC,
        });
    const openImportDatabaseDialogHandler: DialogContext['openImportDatabaseDialog'] =
        useCallback(
            ({ databaseType, importMethods, initialImportMethod }) => {
                setImportDatabaseDialogParams({
                    databaseType,
                    importMethods,
                    initialImportMethod,
                });
                setOpenImportDatabaseDialog(true);
            },
            [setOpenImportDatabaseDialog]
        );

    // Table schema dialog
    const [openTableSchemaDialog, setOpenTableSchemaDialog] = useState(false);
    const [tableSchemaDialogParams, setTableSchemaDialogParams] = useState<
        Omit<TableSchemaDialogProps, 'dialog'>
    >({ schemas: [], onConfirm: emptyFn });
    const openTableSchemaDialogHandler: DialogContext['openTableSchemaDialog'] =
        useCallback(
            (params) => {
                setTableSchemaDialogParams(params);
                setOpenTableSchemaDialog(true);
            },
            [setOpenTableSchemaDialog]
        );

    // Export diagram dialog
    const [openExportDiagramDialog, setOpenExportDiagramDialog] =
        useState(false);

    // Import diagram dialog
    const [openImportDiagramDialog, setOpenImportDiagramDialog] =
        useState(false);

    const newDiagramEverOpened = useOpenedOnce(openNewDiagramDialog);
    const importDatabaseEverOpened = useOpenedOnce(openImportDatabaseDialog);

    return (
        <dialogContext.Provider
            value={{
                openCreateDiagramDialog: openNewDiagramDialogHandler,
                closeCreateDiagramDialog: () => setOpenNewDiagramDialog(false),
                openOpenDiagramDialog: openOpenDiagramDialogHandler,
                closeOpenDiagramDialog: () => setOpenOpenDiagramDialog(false),
                openExportSQLDialog: openExportSQLDialogHandler,
                closeExportSQLDialog: () => setOpenExportSQLDialog(false),
                openCreateRelationshipDialog:
                    openCreateRelationshipDialogHandler,
                closeCreateRelationshipDialog: () =>
                    setOpenCreateRelationshipDialog(false),
                openImportDatabaseDialog: openImportDatabaseDialogHandler,
                closeImportDatabaseDialog: () => {
                    setOpenImportDatabaseDialog(false);
                },
                openTableSchemaDialog: openTableSchemaDialogHandler,
                closeTableSchemaDialog: () => setOpenTableSchemaDialog(false),
                closeExportImageDialog: () => setOpenExportImageDialog(false),
                openExportImageDialog: openExportImageDialogHandler,
                openExportDiagramDialog: () => setOpenExportDiagramDialog(true),
                closeExportDiagramDialog: () =>
                    setOpenExportDiagramDialog(false),
                openImportDiagramDialog: () => setOpenImportDiagramDialog(true),
                closeImportDiagramDialog: () =>
                    setOpenImportDiagramDialog(false),
            }}
        >
            {children}
            {workspace ? (
                <>
                    <ProjectCreateDialog
                        open={openNewDiagramDialog}
                        project={workspace.project}
                        onClose={() => setOpenNewDiagramDialog(false)}
                    />
                    <ProjectOpenDialog
                        open={openOpenDiagramDialog}
                        project={workspace.project}
                        canClose={openDiagramDialogParams?.canClose}
                        onClose={() => setOpenOpenDiagramDialog(false)}
                        onCreate={() => {
                            setOpenOpenDiagramDialog(false);
                            setOpenNewDiagramDialog(true);
                        }}
                    />
                </>
            ) : (
                <>
                    {newDiagramEverOpened ? (
                        <Suspense fallback={null}>
                            <CreateDiagramDialog
                                dialog={{ open: openNewDiagramDialog }}
                                {...newDiagramDialogParams}
                            />
                        </Suspense>
                    ) : null}
                    <OpenDiagramDialog
                        dialog={{ open: openOpenDiagramDialog }}
                        {...openDiagramDialogParams}
                    />
                </>
            )}
            <ExportSQLDialog
                dialog={{ open: openExportSQLDialog }}
                {...exportSQLDialogParams}
            />
            <CreateRelationshipDialog
                dialog={{ open: openCreateRelationshipDialog }}
                {...createRelationshipDialogParams}
            />
            {importDatabaseEverOpened ? (
                <Suspense fallback={null}>
                    <ImportDatabaseDialog
                        dialog={{ open: openImportDatabaseDialog }}
                        {...importDatabaseDialogParams}
                    />
                </Suspense>
            ) : null}
            <TableSchemaDialog
                dialog={{ open: openTableSchemaDialog }}
                {...tableSchemaDialogParams}
            />
            <ExportImageDialog
                dialog={{ open: openExportImageDialog }}
                {...exportImageDialogParams}
            />
            <ExportDiagramDialog dialog={{ open: openExportDiagramDialog }} />
            <ImportDiagramDialog dialog={{ open: openImportDiagramDialog }} />
        </dialogContext.Provider>
    );
};
