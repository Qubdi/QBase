import { createContext, useContext } from 'react';
import type { Id } from '@/core/model/id';
import type { CanvasPrefs } from './hooks';
import type { Point } from './flow-model';

/** A size reported while a resize handle is being dragged. */
export interface LiveBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * What the nodes and edges need from the surface that holds them: the
 * display choices, what is being edited, and the entry points for gestures.
 * One value per canvas, made in `diagram-canvas.tsx`.
 */
export interface SurfaceApi {
    prefs: CanvasPrefs;
    /** false in a read-only diagram: no handles, no resizing, no renaming */
    editable: boolean;
    /** the table shown as the edit form right now */
    editingId?: Id;
    startEditing(id: Id): void;
    stopEditing(): void;
    /** the area whose name is being typed over */
    renamingId?: Id;
    startRename(id: Id): void;
    stopRename(): void;
    /** a resize in progress; `null` box with commit=true ends it */
    resizeLive(id: Id, box: LiveBox): void;
    resizeEnd(): void;
    /** the line popover opens for a link, near a page point */
    openLinkPopover(linkId: Id, at: Point): void;
    /** a quick relationship is being drawn from this table */
    linkSourceId?: Id;
    /** start drawing a quick relationship from a table (EDT-158) */
    beginLink(entityId: Id): void;
}

export const SurfaceContext = createContext<SurfaceApi | null>(null);

export function useSurface(): SurfaceApi {
    const value = useContext(SurfaceContext);
    if (!value) throw new Error('Canvas parts must sit inside DiagramCanvas');
    return value;
}
