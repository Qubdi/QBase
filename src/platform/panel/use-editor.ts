import { useCallback, useContext } from 'react';
import type { Command } from '@/core/commands/command';
import { LocalConfigContext } from '@/context/local-config-context/local-config-context';
import { toast } from '@/platform/toast/use-toast';
import { selectDesign, selectFilter, selectLocked } from '@/store/selectors';
import type { EditResult } from '@/store/editor-store';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';

export interface EditorEnv {
    design: ReturnType<typeof selectDesign>;
    filter: ReturnType<typeof selectFilter>;
    /** the design cannot be edited: read-only session */
    locked: boolean;
    /** View > Database Views */
    showViews: boolean;
    /** applies a command through the history; a refusal shows a toast */
    edit: (
        command: Command | undefined,
        options?: { separate?: boolean }
    ) => EditResult | undefined;
}

/** What every part of the side panel needs from the store, in one place. */
export function useEditorEnv(): EditorEnv {
    const store = useEditorStoreApi();
    const design = useEditorStore(selectDesign);
    const filter = useEditorStore(selectFilter);
    const locked = useEditorStore(selectLocked);
    const { showDbViews } = useContext(LocalConfigContext);
    const edit = useCallback<EditorEnv['edit']>(
        (command, options) => {
            if (!command) return undefined;
            const result = store.getState().edit(command, options);
            // EDT-274: a refused edit leaves the design alone and says so
            if (!result.ok) {
                toast({ description: result.message, variant: 'destructive' });
            }
            return result;
        },
        [store]
    );
    return { design, filter, locked, showViews: showDbViews, edit };
}
