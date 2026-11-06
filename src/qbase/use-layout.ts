import { useMemo } from 'react';
import { selectPanel } from '@/store/selectors';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import { createEditorApi } from './editor-api';

/** The side panel, as the lint control uses it (spec C9). */
export function useLayout() {
    const store = useEditorStoreApi();
    const panel = useEditorStore(selectPanel);
    return useMemo(
        () => ({
            isSidePanelShowed: panel.open,
            openTableFromSidebar: createEditorApi(store).showTableInPanel,
        }),
        [store, panel.open]
    );
}
