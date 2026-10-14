import { useStore, type ReactFlowState } from '@xyflow/react';

/** Ids of the tables that are selected and visible on the canvas. */
export const selectSelectedTableIds = (
    state: Pick<ReactFlowState, 'nodes'>
): string[] =>
    state.nodes
        .filter((n) => n.type === 'table' && n.selected && !n.hidden)
        .map((n) => n.id);

export const sameIds = (a: string[], b: string[]): boolean =>
    a === b || (a.length === b.length && a.every((id, i) => id === b[i]));

/**
 * The selected tables, for components that appear once per table (context
 * menus). The list is rebuilt on every canvas update, including every step of
 * a drag, so it must be compared by content: otherwise every table re-renders
 * on every mouse move.
 */
export const useSelectedTableIds = (): string[] =>
    useStore(selectSelectedTableIds, sameIds);
