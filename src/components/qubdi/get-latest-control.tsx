import React, { useState } from 'react';
import { CloudDownload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/alert-dialog/alert-dialog';
import { Button } from '@/components/button/button';
import { useToast } from '@/components/toast/use-toast';
import { useDiagram } from '@/hooks/use-diagram';
import { useQubdi } from '@/hooks/use-qubdi';
import { useStorage } from '@/hooks/use-storage';
import { errorMessage } from '@/lib/qubdi/api';
import { getLatestFromServer } from '@/lib/qubdi/get-latest';
import { discardUnsavedChanges } from '@/lib/qubdi/save-status-store';
import { useWorkspace } from './workspace-context';

export interface GetLatestDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Asks, then replaces this browser's copy of the open diagram with the version
 * saved in the project. What was not saved to the project is lost.
 */
export const GetLatestDialog: React.FC<GetLatestDialogProps> = ({
    open,
    onOpenChange,
}) => {
    const { t } = useTranslation();
    const workspace = useWorkspace();
    const { currentDiagram } = useDiagram();
    const { deleteDiagram } = useStorage();
    const { toast } = useToast();
    const [busy, setBusy] = useState(false);

    const localId = workspace?.localDiagramId;
    const remoteId = workspace?.remoteDiagramId;
    if (!workspace || !localId || !remoteId) return null;

    const getLatest = async () => {
        setBusy(true);
        try {
            await getLatestFromServer({
                localId,
                remoteId,
                projectSlug: workspace.project.slug,
                deleteLocal: deleteDiagram,
                // the page leaving would otherwise send the discarded edits
                beforeReload: discardUnsavedChanges,
            });
        } catch (e) {
            toast({
                title: t('qubdi.database.getLatest.failedTitle'),
                description: errorMessage(e),
                variant: 'destructive',
            });
            setBusy(false);
            onOpenChange(false);
        }
    };

    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => !busy && onOpenChange(next)}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {t('qubdi.database.getLatest.title')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {t('qubdi.database.getLatest.description', {
                            name: currentDiagram.name,
                        })}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>
                        {t('qubdi.database.getLatest.cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        disabled={busy}
                        onClick={(e) => {
                            // keep the dialog up while the copy is replaced
                            e.preventDefault();
                            void getLatest();
                        }}
                    >
                        {t('qubdi.database.getLatest.confirm')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};

/** Navbar icon for getting the project's latest version of the open diagram. */
export const GetLatestControl: React.FC = () => {
    const { t } = useTranslation();
    const { enabled, user } = useQubdi();
    const workspace = useWorkspace();
    const [open, setOpen] = useState(false);

    if (
        !enabled ||
        !user ||
        !workspace?.localDiagramId ||
        !workspace.remoteDiagramId
    ) {
        return null;
    }

    return (
        <>
            <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t('qubdi.database.getLatest.aria')}
                title={t('qubdi.database.getLatest.aria')}
                onClick={() => setOpen(true)}
            >
                <CloudDownload />
            </Button>
            <GetLatestDialog open={open} onOpenChange={setOpen} />
        </>
    );
};
