import { canRedo, canUndo } from '@/core/history/history';
import { entityList } from '@/core/model/lookup';
import { isVisible } from '@/core/model/visibility-filter';
import { traitsOf } from '@/core/model/database';
import type { EditorState } from './editor-store';

/** Selectors take the whole state and return one narrow piece of it. */
export const selectDesign = (s: EditorState) => s.design;
export const selectDatabaseType = (s: EditorState) => s.design.databaseType;
export const selectPanel = (s: EditorState) => s.ui.panel;
export const selectFilter = (s: EditorState) => s.ui.filter;
export const selectZoom = (s: EditorState) => s.ui.zoom;
export const selectReadonly = (s: EditorState) => s.session.readonly;
export const selectDirty = (s: EditorState) => s.session.dirty;

export const selectCanUndo = (s: EditorState) => canUndo(s.history);
export const selectCanRedo = (s: EditorState) => canRedo(s.history);

/** The design cannot be edited: the session says so. */
export const selectLocked = (s: EditorState) => s.session.readonly;

let visibleCache:
    | {
          entities: EditorState['design']['entities'];
          filter: EditorState['ui']['filter'];
          databaseType: EditorState['design']['databaseType'];
          result: ReturnType<typeof entityList>;
      }
    | undefined;

/**
 * Entities the filter lets through, in side-list order. The same array comes
 * back until the entities, the filter or the database type change, so a
 * component may use it directly as a store selector.
 */
export const selectVisibleEntities = (s: EditorState) => {
    const { entities, databaseType } = s.design;
    const { filter } = s.ui;
    if (
        visibleCache &&
        visibleCache.entities === entities &&
        visibleCache.filter === filter &&
        visibleCache.databaseType === databaseType
    )
        return visibleCache.result;
    const defaultSchema = traitsOf(databaseType).defaultSchema;
    const result = entityList(s.design).filter((e) =>
        isVisible(filter, e, defaultSchema)
    );
    visibleCache = { entities, filter, databaseType, result };
    return result;
};
