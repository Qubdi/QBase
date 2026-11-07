import type { Design } from '@/core/model/design';
import type { Id } from '@/core/model/id';
import { useEditorStore } from '@/store/store-context';
import { useCanvasHooks } from './hooks';

export type DiffMark = 'added' | 'removed' | 'changed';

/**
 * A preview of changes laid over the canvas without changing the design
 * (EDT-241 to EDT-243). `design` is what is drawn instead of the stored one:
 * the stored design plus new tables and the removed ones left in; the marks
 * say how each table and line is coloured. While it is set nothing can be
 * moved, because the extra tables are not in the store.
 */
export interface DiffMarks {
    design: Design;
    tables: Readonly<Record<Id, DiffMark>>;
    links: Readonly<Record<Id, DiffMark>>;
    /** old names of renamed tables, by table id: drawn struck through, an arrow, then the new name */
    renames?: Readonly<Record<Id, string>>;
}

/**
 * Reads one piece of the design the canvas draws: the preview's while a diff is
 * shown, the store's otherwise. The selector keeps a card from redrawing for
 * changes that do not concern it.
 */
export function useShown<T>(
    select: (design: Design) => T,
    equals: (a: T, b: T) => boolean = Object.is
): T {
    const diff = useCanvasHooks().diff;
    return useEditorStore((s) => select(diff?.design ?? s.design), equals);
}
