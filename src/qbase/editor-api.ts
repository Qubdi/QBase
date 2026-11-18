import type { Command } from '@/core/commands/command';
import { createDiagramProjector, diagramToDesign } from './diagram-convert';
import type {
    Diagram,
    DatabaseType,
    DBField,
    DBIndex,
    DBTable,
} from './diagram-types';
import type { EditResult, EditorStore } from '@/store/editor-store';
import {
    columnPatchFromWire,
    entityPatchFromWire,
    keyFromIndex,
} from './wire-edits';

/** The step the re-sync dialog hands to the history (spec C8). */
export interface WholeDiagramUndoAction {
    action: 'updateDiagramData';
    redoData: { diagram: Diagram };
    undoData: { diagram: Diagram };
}

/**
 * What the original QBase code may do with the open editor (architecture
 * section 8). It speaks the saved-diagram shape, never the model, and keeps
 * to the few operations QBase needs: read the diagram, change an index, a
 * column or a table, swap the whole diagram, drive the side panel and canvas.
 */
export interface EditorApi {
    /** the whole diagram; untouched sections keep their array between calls */
    currentDiagram(): Diagram;
    databaseType(): DatabaseType;
    readonly(): boolean;
    setReadonly(readonly: boolean): void;
    addIndex(tableId: string, index: DBIndex): void;
    removeIndex(tableId: string, indexId: string): void;
    updateField(
        tableId: string,
        fieldId: string,
        patch: Partial<DBField>
    ): void;
    updateTable(tableId: string, patch: Partial<DBTable>): void;
    /**
     * Swaps the diagram. By default the history is cleared; with
     * `resetHistory: false` it is left alone, and the caller adds its own step
     * with `addUndoAction`.
     */
    updateDiagramData(
        diagram: Diagram,
        options?: { resetHistory?: boolean }
    ): void;
    /** the same, as one undo step */
    replaceDiagram(diagram: Diagram): void;
    addUndoAction(action: WholeDiagramUndoAction): void;
    resetRedoStack(): void;
    isSidePanelShown(): boolean;
    /** shows the panel on Tables with the table's card expanded */
    showTableInPanel(tableId: string): void;
    focusTable(tableId: string): void;
}

/** A refused command is an error for QBase callers, which await these calls. */
function must(result: EditResult): void {
    if (!result.ok) throw new Error(result.message);
}

function build(store: EditorStore): EditorApi {
    const project = createDiagramProjector();
    const state = () => store.getState();
    const edit = (command: Command) => must(state().edit(command));
    return {
        currentDiagram: () => project(state().design),
        databaseType: () => state().design.databaseType as DatabaseType,
        readonly: () => state().session.readonly,
        setReadonly: (readonly) => state().setReadonly(readonly),

        addIndex: (tableId, index) =>
            edit({
                type: 'part.insert',
                entityId: tableId,
                part: 'keys',
                item: keyFromIndex(index),
            }),
        removeIndex: (tableId, indexId) =>
            edit({
                type: 'part.remove',
                entityId: tableId,
                part: 'keys',
                id: indexId,
            }),
        updateField: (tableId, fieldId, patch) =>
            edit({
                type: 'part.update',
                entityId: tableId,
                part: 'columns',
                id: fieldId,
                patch: columnPatchFromWire(
                    patch,
                    state().design.columns[fieldId]
                ),
            }),
        updateTable: (tableId, patch) =>
            edit({
                type: 'entity.update',
                id: tableId,
                patch: entityPatchFromWire(patch),
            }),

        updateDiagramData: (diagram, options) =>
            must(
                state().replaceDesign(diagramToDesign(diagram).design, {
                    history: options?.resetHistory === false ? 'keep' : 'reset',
                })
            ),
        replaceDiagram: (diagram) =>
            must(
                state().replaceDesign(diagramToDesign(diagram).design, {
                    history: 'step',
                })
            ),
        addUndoAction: ({ undoData, redoData }) =>
            state().pushWholeDesignStep(
                diagramToDesign(undoData.diagram).design,
                diagramToDesign(redoData.diagram).design
            ),
        resetRedoStack: () => state().clearRedo(),

        isSidePanelShown: () => state().ui.panel.open,
        showTableInPanel: (tableId) => state().showEntityInPanel(tableId),
        focusTable: (tableId) => state().focusEntity(tableId),
    };
}

const apis = new WeakMap<EditorStore, EditorApi>();

/** The one facade of a store: it keeps the arrays of unchanged sections stable. */
export function createEditorApi(store: EditorStore): EditorApi {
    let api = apis.get(store);
    if (!api) {
        api = build(store);
        apis.set(store, api);
    }
    return api;
}
