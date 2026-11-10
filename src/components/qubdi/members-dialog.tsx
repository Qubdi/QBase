import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { api, errorMessage, type RemoteMember } from '@/lib/qubdi/api';

export interface MembersDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Server diagram id; undefined when the diagram has not been synced yet. */
    remoteId: string | undefined;
}

export const MembersDialog: React.FC<MembersDialogProps> = ({
    open,
    onOpenChange,
    remoteId,
}) => {
    const { t } = useTranslation();
    const [members, setMembers] = useState<RemoteMember[]>([]);
    const [error, setError] = useState<string | null>(null);

    // only the newest load may set state: a slow reply for an earlier opening
    // or another diagram must not show here
    const newestLoad = useRef(0);
    const cancelLoad = useCallback(() => {
        newestLoad.current += 1;
    }, []);
    const reload = useCallback(() => {
        if (!remoteId) return Promise.resolve();
        const request = ++newestLoad.current;
        return api.listMembers(remoteId).then(
            (list) => {
                if (request === newestLoad.current) setMembers(list);
            },
            (e: unknown) => {
                if (request === newestLoad.current) setError(errorMessage(e));
            }
        );
    }, [remoteId]);

    // each opening, and each other diagram while open, starts empty: reset
    // while rendering, before the effect below starts the load
    const [loadFor, setLoadFor] = useState<string | null>(null);
    const wantedLoad = open ? `open:${remoteId ?? ''}` : null;
    if (loadFor !== wantedLoad) {
        setLoadFor(wantedLoad);
        if (wantedLoad !== null) {
            setError(null);
            setMembers([]);
        }
    }

    useEffect(() => {
        if (!open) return;
        void reload();
        return cancelLoad;
    }, [open, reload, cancelLoad]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md" showClose>
                <DialogHeader>
                    <DialogTitle>
                        {t('qubdi.account.members.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {remoteId &&
                        members.length > 0 &&
                        !members.some((m) => m.role === 'owner')
                            ? t('qubdi.account.members.fromProject')
                            : t('qubdi.account.members.description')}
                    </DialogDescription>
                </DialogHeader>
                {!remoteId ? (
                    <p className="text-sm text-muted-foreground">
                        {t('qubdi.account.members.syncFirst')}
                    </p>
                ) : (
                    <div className="flex flex-col gap-3">
                        <ul
                            className="flex flex-col gap-2"
                            aria-label={t('qubdi.account.members.title')}
                        >
                            {members.map((m) => (
                                <li
                                    key={m.userId}
                                    className="flex items-center justify-between gap-2 text-sm"
                                >
                                    <span className="truncate">{m.email}</span>
                                    <span className="text-muted-foreground">
                                        {m.role}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {error ? (
                    <p role="alert" className="text-sm text-red-500">
                        {error}
                    </p>
                ) : null}
            </DialogContent>
        </Dialog>
    );
};
