import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { Id } from '@/core/model/id';
import type { DiffMarks } from './diff-marks';

/** What the canvas hands to the form that edits one table in place. */
export interface EntityEditorProps {
    entityId: Id;
    /** the form calls this when the person is done (X, Escape from inside) */
    close(): void;
}

/** What the canvas hands to the small card that finishes a quick relationship. */
export interface LinkCardProps {
    sourceEntityId: Id;
    targetEntityId: Id;
    /** where the pointer was, in page pixels, for placing the card */
    anchor: { x: number; y: number };
    /** the card calls this after it created the link, or with nothing on cancel */
    done(createdLinkId?: Id): void;
}

/**
 * The pieces of the editor that are not the canvas's to build: dialogs, forms,
 * the side panel. The workspace fills in whatever it has; the canvas skips an
 * action whose hook is missing.
 */
export interface CanvasHooks {
    /** New Relationship in the background menu: opens the Create Relationship dialog */
    openLinkDialog?(): void;
    /** "Open in sidebar" in the line popover: show the link in the Refs section */
    showLinkInPanel?(linkId: Id): void;
    /** the in-place table form shown instead of the card while a table is edited */
    renderEntityEditor?(props: EntityEditorProps): ReactNode;
    /** the floating card that picks the target field of a quick relationship */
    renderLinkCard?(props: LinkCardProps): ReactNode;
    /** the Search & Filter panel is the workspace's; the toolbar button toggles it */
    toggleFilterPanel?(): void;
    filterPanelOpen?: boolean;
    /** a custom type whose fields are tinted: the corner button clears it */
    highlight?: { label: string; clear(): void };
    /** which schemas new tables may take, for the default of a created table */
    visibleSchemas?: readonly string[];
    /** a preview of changes to draw over the diagram (the DBML section's diff) */
    diff?: DiffMarks;
}

/** Display choices the person made in the View menu. The workspace stores them. */
export interface CanvasPrefs {
    /** wheel zooms (true) or pans (false) */
    zoomOnScroll: boolean;
    showMiniMap: boolean;
    showCardinality: boolean;
    /** sizes and array marks in type chips */
    showFieldAttributes: boolean;
    /** names only: no type chip and no nullability dot */
    compact: boolean;
    /** whether views are drawn at all */
    showViews: boolean;
    /** a quiet outline on tables that overlap (EDT-039, optional) */
    outlineOverlaps: boolean;
}

export const DEFAULT_PREFS: CanvasPrefs = {
    zoomOnScroll: false,
    showMiniMap: true,
    showCardinality: true,
    showFieldAttributes: true,
    compact: false,
    showViews: true,
    outlineOverlaps: false,
};

export const HooksContext = createContext<CanvasHooks>({});

export function useCanvasHooks(): CanvasHooks {
    return useContext(HooksContext);
}
