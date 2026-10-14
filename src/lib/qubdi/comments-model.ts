import type { ViewerGraph } from './viewer-model';

export type CommentTargetType = 'table' | 'field' | 'relationship';

/** The fields both the editor and the read-only viewer need from a comment. */
export interface CommentLike {
    id: string;
    targetType: CommentTargetType;
    targetId: string;
    body: string;
    resolved: boolean;
}

export const targetKey = (type: CommentTargetType, id: string): string =>
    `${type}:${id}`;

export interface TargetSummary {
    /** comments that are still open */
    open: number;
    total: number;
}

/** Counts per target, used to decide where markers go. */
export function summarizeByTarget(
    comments: CommentLike[]
): Map<string, TargetSummary> {
    const map = new Map<string, TargetSummary>();
    for (const c of comments) {
        const key = targetKey(c.targetType, c.targetId);
        const cur = map.get(key) ?? { open: 0, total: 0 };
        cur.total += 1;
        if (!c.resolved) cur.open += 1;
        map.set(key, cur);
    }
    return map;
}

/** Human label for what a comment is attached to, e.g. "users.email". */
export function describeTarget(
    graph: ViewerGraph,
    type: CommentTargetType,
    id: string
): string | null {
    if (type === 'table') {
        return graph.tables.find((t) => t.id === id)?.name ?? null;
    }
    if (type === 'field') {
        for (const t of graph.tables) {
            const f = t.fields.find((x) => x.id === id);
            if (f) return `${t.name}.${f.name}`;
        }
        return null;
    }
    const edge = graph.edges.find((e) => e.id === id);
    return edge ? edge.label || 'relationship' : null;
}

export interface TargetOption {
    type: CommentTargetType;
    id: string;
    label: string;
}

/** Everything a comment can be attached to, for the "add comment" picker. */
export function targetOptions(graph: ViewerGraph): TargetOption[] {
    const options: TargetOption[] = [];
    for (const t of graph.tables) {
        options.push({ type: 'table', id: t.id, label: t.name });
        for (const f of t.fields) {
            options.push({
                type: 'field',
                id: f.id,
                label: `${t.name}.${f.name}`,
            });
        }
    }
    for (const e of graph.edges) {
        options.push({
            type: 'relationship',
            id: e.id,
            label: e.label || 'relationship',
        });
    }
    return options;
}

/** Table ids that should show a marker because a comment sits on the table or one of its fields. */
export function tablesWithComments(
    graph: ViewerGraph,
    comments: CommentLike[]
): Set<string> {
    const ids = new Set<string>();
    const fieldToTable = new Map<string, string>();
    for (const t of graph.tables) {
        for (const f of t.fields) fieldToTable.set(f.id, t.id);
    }
    for (const c of comments) {
        if (c.targetType === 'table') ids.add(c.targetId);
        if (c.targetType === 'field') {
            const t = fieldToTable.get(c.targetId);
            if (t) ids.add(t);
        }
    }
    return ids;
}
