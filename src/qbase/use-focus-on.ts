import { useMemo } from 'react';
import { useEditorStoreApi } from '@/store/store-context';
import { createEditorApi } from './editor-api';

/** Pans the canvas to a table, as the lint control asks (spec C10). */
export function useFocusOn() {
    const store = useEditorStoreApi();
    return useMemo(
        () => ({ focusOnTable: createEditorApi(store).focusTable }),
        [store]
    );
}
