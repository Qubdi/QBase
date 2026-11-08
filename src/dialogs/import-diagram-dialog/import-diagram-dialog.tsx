import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/platform/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { FileUploader } from '@/components/file-uploader/file-uploader';
import { useWorkspace } from '@/components/qubdi/workspace-context';
import { ImportError, importFileText } from '@/core/wire/file-import';
import { useDialog } from '@/hooks/use-dialog';
import { useQubdi } from '@/hooks/use-qubdi';
import { readFileText } from '@/lib/export-import-utils';
import { errorMessage } from '@/lib/qubdi/api';
import { projectDiagramPath } from '@/lib/qubdi/project-path';
import { designToDiagram } from '@/qbase/diagram-convert';
import { useStorage } from '@/qbase/use-storage';

export interface ImportDiagramDialogProps {
    dialog: { open: boolean };
}

/**
 * Brings in a saved diagram file as a new diagram (spec 7): every id is
 * replaced, the dates are now. Inside a project the diagram is created on the
 * server at once, and the local copy is removed again if the server refuses.
 */
export const ImportDiagramDialog: React.FC<ImportDiagramDialogProps> = ({
    dialog,
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const workspace = useWorkspace();
    const { syncDiagram } = useQubdi();
    const { addDiagram, deleteDiagram } = useStorage();
    const { closeImportDiagramDialog, closeCreateDiagramDialog } = useDialog();
    const [file, setFile] = useState<File | undefined>();
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | undefined>();

    const close = () => {
        setFile(undefined);
        setProblem(undefined);
        closeImportDiagramDialog();
    };

    const run = async () => {
        if (!file) return;
        setBusy(true);
        setProblem(undefined);
        let storedId: string | undefined;
        try {
            const { design } = importFileText(await readFileText(file));
            const diagram = designToDiagram(design);
            await addDiagram({ diagram });
            storedId = diagram.id;
            if (workspace) {
                const remoteId = await syncDiagram(
                    diagram,
                    workspace.project.id
                );
                close();
                closeCreateDiagramDialog();
                navigate(projectDiagramPath(workspace.project.slug, remoteId));
            } else {
                close();
                closeCreateDiagramDialog();
                navigate(`/diagrams/${diagram.id}`);
            }
        } catch (err) {
            // nothing is left behind: a local copy that is in no project is removed
            if (storedId) await deleteDiagram(storedId).catch(() => undefined);
            setProblem(
                err instanceof ImportError
                    ? t('editor.importing.file.invalid')
                    : workspace
                      ? errorMessage(err)
                      : t('editor.importing.file.failed')
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog
            open={dialog.open}
            onOpenChange={(open) => !open && !busy && close()}
        >
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {t('editor.importing.file.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('editor.importing.file.description')}
                    </DialogDescription>
                </DialogHeader>
                <FileUploader
                    accept=".json,application/json"
                    label={t('editor.importing.file.drop')}
                    hint={t('editor.importing.file.types')}
                    chosen={file?.name}
                    disabled={busy}
                    onFilesChange={(files) => {
                        setFile(files[0]);
                        setProblem(undefined);
                    }}
                />
                {problem ? (
                    <p role="alert" className="text-sm text-destructive">
                        {problem}
                    </p>
                ) : null}
                <DialogFooter>
                    <Button variant="secondary" onClick={close} disabled={busy}>
                        {t('editor.common.cancel')}
                    </Button>
                    <Button onClick={() => void run()} disabled={!file || busy}>
                        {t('editor.importing.file.action')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
