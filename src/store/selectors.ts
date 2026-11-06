import { canRedo, canUndo } from '@/core/history/history';
import { entityList } from '@/core/model/lookup';
import { isVisible } from '@/core/model/visibility-filter';
import { isOpenOnly, traitsOf } from '@/core/model/database';
import type { EditorState } from './editor-store';

/** Selectors take the whole state and return one narrow piece of it. */
export const selectDesign = (s: EditorState) => s.design;
export const selectDesignId = (s: EditorState) => s.design.id;
export const selectDatabaseType = (s: EditorState) => s.design.databaseType;
export const selectEntities = (s: EditorState) => s.design.entities;
export const selectLinks = (s: EditorState) => s.design.links;
export const selectUi = (s: EditorState) => s.ui;
export const selectSelection = (s: EditorState) => s.ui.selection;
export const selectPanel = (s: EditorState) => s.ui.panel;
export const selectFilter = (s: EditorState) => s.ui.filter;
export const selectZoom = (s: EditorState) => s.ui.zoom;
export const selectFocus = (s: EditorState) => s.ui.focus;
export const selectSession = (s: EditorState) => s.session;
export const selectReadonly = (s: EditorState) => s.session.readonly;
export const selectDirty = (s: EditorState) => s.session.dirty;
export const selectLocation = (s: EditorState) => s.session.location;

export const selectCanUndo = (s: EditorState) => canUndo(s.history);
export const selectCanRedo = (s: EditorState) => canRedo(s.history);

/** The design cannot be edited: the session says so, or its database is open-only. */
export const selectLocked = (s: EditorState) =>
    s.session.readonly || isOpenOnly(s.design.databaseType);

/** Entities the filter lets through, in side-list order. */
export const selectVisibleEntities = (s: EditorState) => {
    const defaultSchema = traitsOf(s.design.databaseType).defaultSchema;
    return entityList(s.design).filter((e) =>
        isVisible(s.ui.filter, e, defaultSchema)
    );
};
