import React, { useEffect } from 'react';
import { useWorkspace } from '@/components/qubdi/workspace-context';
import { useDialog } from '@/hooks/use-dialog';
import { useStorageAdapter } from '@/qbase/storage-context';

/**
 * Shown where the editor would be when no diagram can be opened (spec A3):
 * the Open dialog when there is something to open, else the New dialog. Both
 * are held open, since nothing is behind them. In a project it is always the
 * project's Open dialog.
 */
export const StartFlow: React.FC = () => {
    const adapter = useStorageAdapter();
    const workspace = useWorkspace();
    const dialogs = useDialog();

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            if (workspace)
                return dialogs.openOpenDiagramDialog({ canClose: false });
            const stored = await adapter.list().catch(() => []);
            if (cancelled) return;
            if (stored.length > 0)
                dialogs.openOpenDiagramDialog({ canClose: false });
            else dialogs.openCreateDiagramDialog();
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the dialog functions are stable per provider; the flow runs once per adapter and workspace
    }, [adapter, workspace]);

    return <div className="h-dvh w-dvw bg-background" />;
};
