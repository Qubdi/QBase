interface FadeNode {
    id: string;
    type?: string;
    selected?: boolean;
}

interface FadeEdge {
    source: string;
    target: string;
}

/** The tables to keep in focus: the selected ones and what links to them. */
const focusedTables = (
    nodes: readonly FadeNode[],
    edges: readonly FadeEdge[]
): Set<string> | null => {
    const selected = new Set<string>();
    for (const node of nodes) {
        if (node.type === 'table' && node.selected) selected.add(node.id);
    }
    if (selected.size === 0) return null;
    const focused = new Set(selected);
    for (const edge of edges) {
        if (selected.has(edge.source)) focused.add(edge.target);
        if (selected.has(edge.target)) focused.add(edge.source);
    }
    return focused;
};

// Every table node asks on every change of the canvas store. They all ask
// about the same nodes and edges, so the answer is worked out once per change
// and not once per table.
let last: {
    nodes: readonly FadeNode[];
    edges: readonly FadeEdge[];
    focused: Set<string> | null;
} | null = null;

/**
 * With a table selected, tables that are neither selected nor linked to it
 * fade back, so the connected ones stand out on a crowded canvas.
 */
export const isUnrelatedToSelection = (
    nodes: readonly FadeNode[],
    edges: readonly FadeEdge[],
    id: string
): boolean => {
    if (!last || last.nodes !== nodes || last.edges !== edges) {
        last = { nodes, edges, focused: focusedTables(nodes, edges) };
    }
    return last.focused !== null && !last.focused.has(id);
};
