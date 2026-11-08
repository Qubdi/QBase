import type { EntityKind } from '@/core/model/entity';
import type { EditorStore } from '@/store/editor-store';
import { addEntityAt, addNoteAt, addRegionAt } from './canvas-actions';
import type { Point } from './flow-model';

/**
 * The data type of a drag that starts outside the canvas and carries the kind
 * of item to create where it is dropped. The side panel sets it on the drag.
 */
export const NEW_ITEM_TYPE = 'application/x-qbase-new-item';

export type NewItemKind = EntityKind | 'area' | 'note';

export function isNewItemKind(value: string): value is NewItemKind {
    return ['table', 'view', 'area', 'note'].includes(value);
}

/** Creates the dropped item at a canvas point. Returns false if the drop is not ours. */
export function dropNewItem(
    store: EditorStore,
    kind: string,
    at: Point,
    visibleSchemas?: readonly string[],
    measure?: Parameters<typeof addEntityAt>[4]
): boolean {
    if (!isNewItemKind(kind)) return false;
    if (kind === 'area') return addRegionAt(store, at) !== undefined;
    if (kind === 'note') return addNoteAt(store, at) !== undefined;
    return addEntityAt(store, kind, at, visibleSchemas, measure) !== undefined;
}

/**
 * Props that make an element a drag source for a new item. Nothing is
 * draggable when `enabled` is false (read-only diagrams).
 */
export function newItemDragProps(
    kind: NewItemKind,
    enabled = true
): {
    draggable: boolean;
    onDragStart?: (event: {
        dataTransfer: Pick<DataTransfer, 'setData' | 'effectAllowed'>;
    }) => void;
} {
    if (!enabled) return { draggable: false };
    return {
        draggable: true,
        onDragStart: (event) => {
            event.dataTransfer.setData(NEW_ITEM_TYPE, kind);
            event.dataTransfer.effectAllowed = 'copy';
        },
    };
}
