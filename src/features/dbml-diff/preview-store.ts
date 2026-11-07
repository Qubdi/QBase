import { create } from 'zustand';
import type { DiffMarks } from '@/canvas/diff-marks';

interface PreviewState {
    /** what the canvas draws over the diagram; none when no diff is showing */
    marks?: DiffMarks;
    show(marks: DiffMarks): void;
    clear(): void;
}

/**
 * The DBML section writes the diff here and the canvas slot reads it; the two
 * live in different parts of the page. Nothing in it is saved or undoable.
 */
export const usePreviewStore = create<PreviewState>((set) => ({
    marks: undefined,
    show: (marks) => set({ marks }),
    clear: () => set({ marks: undefined }),
}));
