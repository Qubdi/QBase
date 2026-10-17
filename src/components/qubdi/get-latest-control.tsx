import React, { useState } from 'react';
import { CloudDownload } from 'lucide-react';
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
                title: 'Could not get the latest version',
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
                    <AlertDialogTitle>Get the latest version?</AlertDialogTitle>
                    <AlertDialogDescription>
                        {`"${currentDiagram.name}" is replaced by the version saved in the project. Changes to it that were not saved to the project are lost.`}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        disabled={busy}
                        onClick={(e) => {
                            // keep the dialog up while the copy is replaced
                            e.preventDefault();
                            void getLatest();
                        }}
                    >
                        Get latest
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};

/** Navbar icon for getting the project's latest version of the open diagram. */
export const GetLatestControl: React.FC = () => {
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
                aria-label="Get latest from server"
                title="Get latest from server"
                onClick={() => setOpen(true)}
            >
                <CloudDownload />
            </Button>
            <GetLatestDialog open={open} onOpenChange={setOpen} />
        </>
    );
};
