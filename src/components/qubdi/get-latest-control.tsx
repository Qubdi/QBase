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
} from '@/platform/ui/alert-dialog';
import { Button } from '@/platform/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/platform/ui/tooltip';
import { useToast } from '@/platform/toast/use-toast';
import { useQubdi } from '@/hooks/use-qubdi';
import { getLatestFromServer } from '@/lib/qubdi/get-latest';
import { discardUnsavedChanges } from '@/lib/qubdi/save-status-store';
import { useDiagram } from '@/qbase/use-diagram';
import { useStorage } from '@/qbase/use-storage';
import { useWorkspace } from './workspace-context';

export interface GetLatestDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Asks before replacing this browser's copy of the open diagram with the
 * version saved in the project, then does it and reloads the page. Edits that
 * were not sent are dropped first, so leaving the page does not send them.
 */
export const GetLatestDialog: React.FC<GetLatestDialogProps> = ({
    open,
    onOpenChange,
}) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const workspace = useWorkspace();
    const { deleteDiagram } = useStorage();
    const { currentDiagram } = useDiagram();
    const [busy, setBusy] = useState(false);

    const confirm = async (event: React.MouseEvent) => {
        // the dialog stays open until the work ends, so a second click is refused
        event.preventDefault();
        if (busy || !workspace?.localDiagramId || !workspace.remoteDiagramId)
            return;
        setBusy(true);
        try {
            await getLatestFromServer({
                localId: workspace.localDiagramId,
                remoteId: workspace.remoteDiagramId,
                projectSlug: workspace.project.slug,
                deleteLocal: deleteDiagram,
                beforeReload: discardUnsavedChanges,
            });
        } catch {
            toast({
                title: t('qubdi.database.getLatest.failedTitle'),
                variant: 'destructive',
            });
            onOpenChange(false);
        } finally {
            setBusy(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
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
                        onClick={(e) => void confirm(e)}
                    >
                        {t('qubdi.database.getLatest.confirm')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};

/**
 * Navbar icon that brings the project's version of the open diagram into this
 * browser. Shown only to a signed-in person, for a diagram that has a copy
 * here and a copy on the server.
 */
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
    )
        return null;

    const label = t('qubdi.database.getLatest.aria');
    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={label}
                        onClick={() => setOpen(true)}
                    >
                        <CloudDownload className="size-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
            </Tooltip>
            <GetLatestDialog open={open} onOpenChange={setOpen} />
        </>
    );
};
