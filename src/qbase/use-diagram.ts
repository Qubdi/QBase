import { useMemo } from 'react';
import { selectDesign, selectReadonly } from '@/store/selectors';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import { createEditorApi } from './editor-api';
import type { DBField, DBIndex, DBTable, Diagram } from './diagram-types';
import type { DatabaseType } from './diagram-types';

export interface UseDiagram {
    /** the diagram being edited; an edit replaces only the sections it touched */
    currentDiagram: Diagram;
    /** the diagram open right now, for code that waited and must not use a stale render */
    getCurrentDiagram: () => Diagram;
    tables: DBTable[];
    databaseType: DatabaseType;
    readonly: boolean;
    addIndex: (tableId: string, index: DBIndex) => Promise<void>;
    removeIndex: (tableId: string, indexId: string) => Promise<void>;
    updateField: (
        tableId: string,
        fieldId: string,
        patch: Partial<DBField>
    ) => Promise<void>;
    updateTable: (tableId: string, patch: Partial<DBTable>) => Promise<void>;
    updateDiagramData: (
        diagram: Diagram,
        options?: { resetHistory?: boolean }
    ) => Promise<void>;
}

/** The open diagram in the saved shape, and the few edits QBase code makes to it. */
export function useDiagram(): UseDiagram {
    const store = useEditorStoreApi();
    const design = useEditorStore(selectDesign);
    const readonly = useEditorStore(selectReadonly);
    const api = createEditorApi(store);
    // the facade makes a new diagram only when the design changed
    const currentDiagram = useMemo(
        () => api.currentDiagram(),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `design` is the change signal
        [api, design]
    );
    return useMemo(
        () => ({
            currentDiagram,
            getCurrentDiagram: () => api.currentDiagram(),
            tables: currentDiagram.tables ?? [],
            databaseType: currentDiagram.databaseType,
            readonly,
            addIndex: async (tableId, index) => api.addIndex(tableId, index),
            removeIndex: async (tableId, indexId) =>
                api.removeIndex(tableId, indexId),
            updateField: async (tableId, fieldId, patch) =>
                api.updateField(tableId, fieldId, patch),
            updateTable: async (tableId, patch) =>
                api.updateTable(tableId, patch),
            updateDiagramData: async (diagram, options) =>
                api.updateDiagramData(diagram, options),
        }),
        [api, currentDiagram, readonly]
    );
}
