import { useSyncExternalStore } from 'react';
import {
    summarizeByTarget,
    targetKey,
    type CommentLike,
    type CommentTargetType,
    type TargetSummary,
} from './comments-model';

/**
 * Tiny external store for the editor's comments. The canvas renders hundreds
 * of nodes; a store lets any marker subscribe without prop-drilling through
 * the editor's existing components.
 */
export interface EditorComment extends CommentLike {
    snapshotVersion: number;
    orphaned: boolean;
    authorEmail: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CommentsState {
    comments: EditorComment[];
    summary: Map<string, TargetSummary>;
    showMarkers: boolean;
    panelOpen: boolean;
    /** target the panel should highlight (set when a marker is clicked) */
    focus: { type: CommentTargetType; id: string } | null;
}

const initial = (): CommentsState => ({
    comments: [],
    summary: new Map(),
    showMarkers: true,
    panelOpen: false,
    focus: null,
});

let state: CommentsState = initial();
const listeners = new Set<() => void>();

const set = (patch: Partial<CommentsState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
};

export const commentsStore = {
    getState: () => state,
    subscribe: (l: () => void) => {
        listeners.add(l);
        return () => listeners.delete(l);
    },
    setComments(comments: EditorComment[]) {
        // orphaned comments have no marker to show; they live only in the panel
        set({
            comments,
            summary: summarizeByTarget(comments.filter((c) => !c.orphaned)),
        });
    },
    toggleMarkers: () => set({ showMarkers: !state.showMarkers }),
    openPanel(focus: CommentsState['focus'] = null) {
        set({ panelOpen: true, focus });
    },
    closePanel: () => set({ panelOpen: false, focus: null }),
    reset: () => set(initial()),
};

export const useCommentsState = () =>
    useSyncExternalStore(commentsStore.subscribe, commentsStore.getState);

/** Marker data for one target; null when there is nothing to show. */
export function useTargetSummary(
    type: CommentTargetType,
    id: string
): TargetSummary | null {
    const s = useCommentsState();
    if (!s.showMarkers) return null;
    return s.summary.get(targetKey(type, id)) ?? null;
}
