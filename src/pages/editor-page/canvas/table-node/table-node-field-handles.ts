// Which connection handles a table field needs right now.
//
// React Flow asks every mounted handle to look at its store on every update,
// and a drag updates it many times a second. A big diagram has thousands of
// fields, so mounting three or more invisible handles for each of them makes
// moving a table slow. A field only needs handles when something uses them:
//
//  - source handles: a relationship starts at this field (its line needs them),
//    or the table is focused, so a new line can be dragged out of the field;
//  - target handles: one per line that ends at this field, and, only while a
//    line is being dragged onto this table, one that covers the row as a drop zone.

export interface FieldHandleInput {
    isConnectable: boolean;
    /** the table is selected or hovered: new lines can be dragged from it */
    focused: boolean;
    /** a relationship starts at this field */
    isRelationshipSource: boolean;
    /** a new line is currently being dragged */
    connectionInProgress: boolean;
    /** that new line could end on this field's table */
    isTarget: boolean;
    /** relationships that end at this field */
    numberOfEdgesToField: number;
}

export interface FieldHandlePlan {
    source: boolean;
    /** handles for lines that already end here */
    targets: number;
    /** the drop zone shown while dragging a new line onto this table */
    dropZone: boolean;
    /**
     * Changes whenever the handles that need measuring change. React Flow only
     * learns where handles are when told to measure, so this is the cue.
     * (The drop zone is found by React Flow from the page itself, so it does
     * not need measuring.)
     */
    layoutKey: string;
}

export function planFieldHandles(input: FieldHandleInput): FieldHandlePlan {
    const {
        isConnectable,
        focused,
        isRelationshipSource,
        connectionInProgress,
        isTarget,
        numberOfEdgesToField,
    } = input;

    const source = isConnectable && (focused || isRelationshipSource);
    // while a line is dragged, tables that cannot receive it hide their target handles
    const targetsMounted = isConnectable && (!connectionInProgress || isTarget);
    const targets = targetsMounted ? numberOfEdgesToField : 0;
    const dropZone = targetsMounted && isTarget;

    return {
        source,
        targets,
        dropZone,
        layoutKey: `${source ? 1 : 0}:${targets}`,
    };
}

// Several fields of one table often ask for a re-measure in the same frame
// (focusing a table changes all of them); one is enough.
const pending = new Set<string>();

/** Runs `update(tableId)` once per frame per table, however often it is asked. */
export function scheduleOncePerFrame(
    tableId: string,
    update: (tableId: string) => void,
    raf: (cb: () => void) => unknown = (cb) => requestAnimationFrame(cb)
) {
    if (pending.has(tableId)) return;
    pending.add(tableId);
    raf(() => {
        pending.delete(tableId);
        update(tableId);
    });
}

/** Test helper: forget anything still waiting. */
export const resetPendingForTests = () => pending.clear();
