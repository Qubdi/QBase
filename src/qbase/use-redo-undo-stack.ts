import { useMemo } from 'react';
import { useEditorStoreApi } from '@/store/store-context';
import { createEditorApi } from './editor-api';
import type { EditorApi } from './editor-api';

/** The editor's history, as the re-sync dialog uses it (spec C8). */
export function useRedoUndoStack(): Pick<
    EditorApi,
    'addUndoAction' | 'resetRedoStack'
> {
    const store = useEditorStoreApi();
    return useMemo(() => {
        const api = createEditorApi(store);
        return {
            addUndoAction: api.addUndoAction,
            resetRedoStack: api.resetRedoStack,
        };
    }, [store]);
}
