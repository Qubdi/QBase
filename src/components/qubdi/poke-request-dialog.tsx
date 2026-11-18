import React, { useState } from 'react';
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
import { useToast } from '@/platform/toast/use-toast';
import { api, ApiError, errorMessage } from '@/lib/qubdi/api';
import { getEditorId } from '@/lib/qubdi/editor-id';
import { reportLockLost } from '@/lib/qubdi/lock-lost';
import {
    flushPendingSave,
    hasUnsavedChanges,
} from '@/lib/qubdi/save-status-store';
import { useDiagramAccess } from './diagram-access-context';
import { useLockChannel } from './lock-channel-context';

/**
 * Shown to the editor that holds a diagram when another editor asks it to step
 * out. It has to be answered: Escape and a click outside do nothing, so the
 * request is never dismissed by accident. Agreeing first sends the last edits
 * to the server (and does nothing if they cannot be sent, so no work is
 * lost), then hands the diagram over, and the editor turns read-only.
 */
export const PokeRequestDialog: React.FC = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { access } = useDiagramAccess();
    const { incoming, dismiss } = useLockChannel();
    const [busy, setBusy] = useState<'agree' | 'decline' | null>(null);

    // only the editor that holds the lock has anything to step out of
    const remoteId = access.status === 'editor' ? access.remoteId : undefined;
    const poke = remoteId ? incoming : null;
    // the dialog fades out after the request is over: keep the last one so its
    // title still names the requester while it does
    const [last, setLast] = useState(poke);
    if (poke && poke !== last) setLast(poke);

    const answer = async (accept: boolean) => {
        if (!remoteId || !poke || busy) return;
        setBusy(accept ? 'agree' : 'decline');
        try {
            if (accept) {
                // the last edits reach the server before the lock leaves
                await flushPendingSave();
                if (hasUnsavedChanges()) {
                    toast({
                        title: t(
                            'qubdi.workspace.poke.request.saveFailedTitle'
                        ),
                        description: t(
                            'qubdi.workspace.poke.request.saveFailed'
                        ),
                        variant: 'destructive',
                    });
                    return; // still the editor: nothing was handed over
                }
            }
            await api.answerPoke(remoteId, poke.pokeId, getEditorId(), accept);
            dismiss(poke.pokeId);
            if (accept) reportLockLost(remoteId, poke.from);
        } catch (e) {
            toast({
                title: t('qubdi.workspace.poke.request.failedTitle'),
                description: errorMessage(e),
                variant: 'destructive',
            });
            // a request that is over (or was never for this editor) cannot be answered
            if (e instanceof ApiError && [404, 409, 410].includes(e.status)) {
                dismiss(poke.pokeId);
            }
        } finally {
            setBusy(null);
        }
    };

    return (
        <AlertDialog open={poke !== null} onOpenChange={() => undefined}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {t('qubdi.workspace.poke.request.title', {
                            requester: (poke ?? last)?.from,
                        })}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {t('qubdi.workspace.poke.request.description')}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel
                        disabled={busy !== null}
                        onClick={(e) => {
                            // the dialog closes when the request is over, not on the click
                            e.preventDefault();
                            void answer(false);
                        }}
                    >
                        {t('qubdi.workspace.poke.request.decline')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        disabled={busy !== null}
                        onClick={(e) => {
                            e.preventDefault();
                            void answer(true);
                        }}
                    >
                        {busy === 'agree'
                            ? t('qubdi.workspace.poke.request.saving')
                            : t('qubdi.workspace.poke.request.agree')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
