import { createContext } from 'react';
import type { DatabaseType } from '@/core/model/database';
import type { ImageFormat } from '@/formats/image/export-options';
import type { ImportMethod } from '@/features/import/import-method';

export interface OpenDiagramOptions {
    /** false when nothing is open behind the dialog, so it cannot be dismissed */
    canClose?: boolean;
}

export interface ImportIntoOpenOptions {
    /** the methods the caller allows; the menu items pass one */
    methods?: readonly ImportMethod[];
    initial?: ImportMethod;
}

/**
 * The editor's dialogs, opened by name. The QBase code needs two of them
 * (spec B2, P9): the create dialog and the open dialog with a can-close flag.
 */
export interface DialogApi {
    openCreateDiagramDialog(): void;
    closeCreateDiagramDialog(): void;
    /** the list of example diagrams */
    openExamplesDialog(): void;
    closeExamplesDialog(): void;
    openOpenDiagramDialog(options?: OpenDiagramOptions): void;
    closeOpenDiagramDialog(): void;
    /** the .json file import */
    openImportDiagramDialog(): void;
    closeImportDiagramDialog(): void;
    /** SQL and DBML (and metadata) import into the open diagram */
    openImportDatabaseDialog(options?: ImportIntoOpenOptions): void;
    closeImportDatabaseDialog(): void;
    openExportSqlDialog(target: DatabaseType): void;
    closeExportSqlDialog(): void;
    openExportJsonDialog(): void;
    closeExportJsonDialog(): void;
    openExportImageDialog(format: ImageFormat): void;
    closeExportImageDialog(): void;
    openSettingsDialog(): void;
    closeSettingsDialog(): void;
    openClearDiagramDialog(): void;
    closeClearDiagramDialog(): void;
    openDeleteDiagramDialog(): void;
    closeDeleteDiagramDialog(): void;
}

const missing = () => {
    throw new Error('No dialog provider: wrap the editor in DialogProvider');
};

export const DialogContext = createContext<DialogApi>({
    openCreateDiagramDialog: missing,
    closeCreateDiagramDialog: missing,
    openExamplesDialog: missing,
    closeExamplesDialog: missing,
    openOpenDiagramDialog: missing,
    closeOpenDiagramDialog: missing,
    openImportDiagramDialog: missing,
    closeImportDiagramDialog: missing,
    openImportDatabaseDialog: missing,
    closeImportDatabaseDialog: missing,
    openExportSqlDialog: missing,
    closeExportSqlDialog: missing,
    openExportJsonDialog: missing,
    closeExportJsonDialog: missing,
    openExportImageDialog: missing,
    closeExportImageDialog: missing,
    openSettingsDialog: missing,
    closeSettingsDialog: missing,
    openClearDiagramDialog: missing,
    closeClearDiagramDialog: missing,
    openDeleteDiagramDialog: missing,
    closeDeleteDiagramDialog: missing,
});
