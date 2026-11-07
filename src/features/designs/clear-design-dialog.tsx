import React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/platform/toast/use-toast';
import { createDesign } from '@/core/model/defaults';
import { useEditorStoreApi } from '@/store/store-context';
import { ConfirmDialog } from './confirm-dialog';
import { diagnosticText } from '@/lib/diagnostic-text';

export interface ClearDesignDialogProps {
    open: boolean;
    onClose: () => void;
}

/**
 * Edit > Clear: removes everything but keeps the diagram's identity (id, name,
 * database, creation date). It cannot be undone and the history is emptied
 * (spec 13.3).
 */
export const ClearDesignDialog: React.FC<ClearDesignDialogProps> = ({
    open,
    onClose,
}) => {
    const { t } = useTranslation();
    const store = useEditorStoreApi();

    const confirm = () => {
        const state = store.getState();
        const { design } = state;
        const now = Date.now();
        const blank = {
            ...createDesign({
                id: design.id,
                name: design.name,
                databaseType: design.databaseType,
                databaseEdition: design.databaseEdition,
                now,
            }),
            createdAt: design.createdAt,
        };
        const result = state.replaceDesign(blank, { history: 'reset' });
        if (result.ok) store.getState().markDirty();
        else
            toast({
                title: t('editor.designs.clear.failed'),
                description: diagnosticText(result.message),
                variant: 'destructive',
            });
        onClose();
    };

    return (
        <ConfirmDialog
            open={open}
            title={t('editor.designs.clear.title')}
            description={t('editor.designs.clear.description')}
            confirmLabel={t('editor.designs.clear.confirm')}
            cancelLabel={t('editor.common.cancel')}
            destructive
            onConfirm={confirm}
            onCancel={onClose}
        />
    );
};
