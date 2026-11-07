import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from '@/platform/toast/use-toast';
import { useWorkspace } from '@/components/qubdi/workspace-context';
import { api, errorMessage } from '@/lib/qubdi/api';
import { projectHomePath } from '@/lib/qubdi/project-path';
import { clearRemoteId } from '@/lib/qubdi/remote-map';
import { useStorageAdapter } from '@/qbase/storage-context';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import { ConfirmDialog } from './confirm-dialog';
import { removeStoredDesign } from './design-service';
import '@/i18n/editor/register';

export interface DeleteOpenDesignDialogProps {
    open: boolean;
    onClose: () => void;
}

/**
 * Menu "Delete diagram" (spec A5). In a project the server copy goes first, so
 * a refusal loses nothing; then the browser's copy and its server mapping;
 * then the person lands on the project's list. Without a project the app goes
 * back to `/`.
 */
export const DeleteOpenDesignDialog: React.FC<DeleteOpenDesignDialogProps> = ({
    open,
    onClose,
}) => {
    const { t } = useTranslation();
    const adapter = useStorageAdapter();
    const store = useEditorStoreApi();
    const navigate = useNavigate();
    const workspace = useWorkspace();
    const name = useEditorStore((s) => s.design.name);

    const confirm = async () => {
        const { design } = store.getState();
        // read-only stops the autosave from writing the diagram back
        store.getState().setReadonly(true);
        try {
            if (workspace?.remoteDiagramId)
                await api.deleteDiagram(workspace.remoteDiagramId);
            await removeStoredDesign(adapter, design.id);
            if (workspace) {
                clearRemoteId(design.id);
                onClose();
                navigate(projectHomePath(workspace.project.slug));
            } else {
                window.location.assign('/');
            }
        } catch (error) {
            store.getState().setReadonly(false);
            onClose();
            toast({
                title: t('editor.designs.delete.failed'),
                description: workspace ? errorMessage(error) : undefined,
                variant: 'destructive',
            });
        }
    };

    return (
        <ConfirmDialog
            open={open}
            title={t('editor.designs.delete.title')}
            description={t('editor.designs.delete.description', { name })}
            confirmLabel={t('editor.designs.delete.confirm')}
            cancelLabel={t('editor.common.cancel')}
            destructive
            onConfirm={confirm}
            onCancel={onClose}
        />
    );
};
