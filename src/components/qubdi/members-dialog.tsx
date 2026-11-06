import React, { useCallback, useEffect, useState } from 'react';
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

    const reload = useCallback(async () => {
        if (!remoteId) return;
        try {
            setMembers(await api.listMembers(remoteId));
        } catch (e) {
            setError(errorMessage(e));
        }
    }, [remoteId]);

    useEffect(() => {
        if (open) {
            setError(null);
            void reload();
        }
    }, [open, reload]);

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
