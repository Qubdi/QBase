import { canRedo, canUndo } from '@/core/history/history';
import type { EditorState } from './editor-store';

/** Selectors take the whole state and return one narrow piece of it. */
export const selectDesign = (s: EditorState) => s.design;
export const selectDatabaseType = (s: EditorState) => s.design.databaseType;
export const selectPanel = (s: EditorState) => s.ui.panel;
export const selectFilter = (s: EditorState) => s.ui.filter;
export const selectZoom = (s: EditorState) => s.ui.zoom;
export const selectReadonly = (s: EditorState) => s.session.readonly;

export const selectCanUndo = (s: EditorState) => canUndo(s.history);
export const selectCanRedo = (s: EditorState) => canRedo(s.history);

/** The design cannot be edited: the session says so. */
export const selectLocked = (s: EditorState) => s.session.readonly;
