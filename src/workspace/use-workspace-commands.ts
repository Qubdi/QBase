import { useContext, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from '@/platform/toast/use-toast';
import { LocalConfigContext } from '@/context/local-config-context/local-config-context';
import { useTheme } from '@/platform/theme/theme-context';
import { useDialog } from '@/hooks/use-dialog';
import { useQubdi } from '@/hooks/use-qubdi';
import { useEditorStoreApi } from '@/store/store-context';
import { useCanvasActions } from './canvas-bridge-context';
import type { ShortcutId } from './shortcuts';

export type WorkspaceCommands = Partial<Record<ShortcutId, () => void>>;

/**
 * What the shortcuts and menus do, in one place. The returned object is
 * stable: it reads the latest settings when a command runs.
 */
export function useWorkspaceCommands(): WorkspaceCommands {
    const { t } = useTranslation();
    const store = useEditorStoreApi();
    const dialogs = useDialog();
    const canvas = useCanvasActions();
    const navigate = useNavigate();
    const { enabled } = useQubdi();
    const config = useContext(LocalConfigContext);
    const { resolvedTheme } = useTheme();

    const latest = useRef({
        dialogs,
        canvas,
        navigate,
        enabled,
        config,
        resolvedTheme,
        t,
    });
    latest.current = {
        dialogs,
        canvas,
        navigate,
        enabled,
        config,
        resolvedTheme,
        t,
    };

    return useMemo<WorkspaceCommands>(
        () => ({
            undo: () => void store.getState().undo(),
            redo: () => void store.getState().redo(),
            openDiagram: () => {
                const now = latest.current;
                // with a server the list of diagrams is the project list (spec A8)
                if (now.enabled) now.navigate('/');
                else now.dialogs.openOpenDiagramDialog({ canClose: true });
            },
            // changes are written as they happen; the key only confirms it (EDT-257)
            save: () => {
                const { dirty } = store.getState().session;
                toast({
                    title: latest.current.t(
                        dirty
                            ? 'editor.workspace.toasts.saving'
                            : 'editor.workspace.toasts.saved'
                    ),
                });
            },
            togglePanel: () => {
                const state = store.getState();
                if (state.ui.panel.open) state.hidePanel();
                else state.showPanel();
            },
            fitAll: () => latest.current.canvas.fitAll(),
            toggleTheme: () => {
                const now = latest.current;
                // from System the key goes to the opposite of the current look
                now.config.setTheme(
                    now.resolvedTheme === 'dark' ? 'light' : 'dark'
                );
            },
            toggleFilter: () => latest.current.canvas.toggleFilter(),
        }),
        [store]
    );
}
