import { SelectionMode } from '@xyflow/react';
import type { ReactFlowProps } from '@xyflow/react';
import { ZOOM_MAX, ZOOM_MIN } from '@/store/editor-state';
import { FIT_MAX_ZOOM, FIT_PADDING, GRID } from './geometry';
import type { CanvasPrefs } from './hooks';

/**
 * How the surface answers the pointer and the keyboard, as one set of
 * xyflow props (EDT-015 to EDT-019, EDT-027, EDT-028, EDT-035). Kept apart
 * from the component so the choices can be read, and tested, in one place.
 */
export function interactionProps(
    prefs: Pick<CanvasPrefs, 'zoomOnScroll'>,
    state: { editable: boolean; shiftHeld: boolean }
): Partial<ReactFlowProps> {
    return {
        minZoom: ZOOM_MIN,
        maxZoom: ZOOM_MAX,
        // dragging the empty background pans; the wheel pans unless the
        // person chose to zoom with it; Ctrl or Cmd with the wheel always zooms
        panOnDrag: true,
        panOnScroll: !prefs.zoomOnScroll,
        zoomOnScroll: prefs.zoomOnScroll,
        zoomOnPinch: true,
        zoomActivationKeyCode: ['Control', 'Meta'],
        // Shift with a background drag draws the rubber band; a rectangle only
        // takes what it wholly encloses
        selectionKeyCode: 'Shift',
        selectionMode: SelectionMode.Full,
        multiSelectionKeyCode: ['Shift', 'Control', 'Meta'],
        // Delete is handled by the canvas itself, so typing is never hijacked
        deleteKeyCode: null,
        nodesDraggable: state.editable,
        nodesConnectable: state.editable,
        elevateNodesOnSelect: false,
        selectNodesOnDrag: false,
        snapToGrid: state.shiftHeld,
        snapGrid: [GRID, GRID],
        fitView: true,
        fitViewOptions: { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM },
    };
}
