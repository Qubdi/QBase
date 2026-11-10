import type { History } from '@/core/history/history';
import type { Design } from '@/core/model/design';
import type { Id } from '@/core/model/id';
import type { WireWarning } from '@/core/wire/warning';

/** Sections of the left side panel (spec A7). */
export type PanelSection =
    'tables' | 'dbml' | 'refs' | 'customTypes' | 'visuals';
export type VisualsTab = 'areas' | 'notes';

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 5;

/** What the person is looking at. None of it is saved with the design or undoable (the table filter is the exception: it lives in `design.filter`). */
export interface UiState {
    /** ids of the selected entities, regions, memos and links */
    selection: Id[];
    panel: {
        open: boolean;
        section: PanelSection;
        visualsTab: VisualsTab;
        /** the entity whose card is expanded in the Tables section */
        expandedEntityId?: Id;
    };
    zoom: number;
    /** the custom type whose fields are tinted (EDT-196); one at a time, never saved */
    highlightedTypeId?: Id;
    /**
     * A request for the canvas to pan to an entity. The number changes on every
     * request, so asking for the same entity twice is seen twice.
     */
    focus?: { entityId: Id; request: number };
}

/** Where the open design came from. */
export interface DiagramLocation {
    diagramId: string;
    /** set inside a project workspace */
    projectSlug?: string;
    remoteDiagramId?: string;
}

export interface SessionState {
    /** true refuses every command (viewer, taken lock, compare view) */
    readonly: boolean;
    /** true while the design differs from what was last saved */
    dirty: boolean;
    /** time of the last successful save, ms */
    savedAt?: number;
    /** repairs made while the design was read; shown once */
    warnings: WireWarning[];
    location: DiagramLocation;
}

export interface EditorData {
    design: Design;
    history: History;
    ui: UiState;
    session: SessionState;
}
