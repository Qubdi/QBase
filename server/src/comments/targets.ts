export type CommentTargetType = 'table' | 'field' | 'relationship';

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/** Does a table, field or relationship with this id exist in the diagram content? */
export function targetExists(
    content: unknown,
    type: CommentTargetType,
    id: string
): boolean {
    if (!isRecord(content)) return false;
    const tables = Array.isArray(content.tables) ? content.tables : [];
    if (type === 'table') {
        return tables.some((t) => isRecord(t) && t.id === id);
    }
    if (type === 'field') {
        return tables.some(
            (t) =>
                isRecord(t) &&
                Array.isArray(t.fields) &&
                t.fields.some((f) => isRecord(f) && f.id === id)
        );
    }
    const rels = Array.isArray(content.relationships)
        ? content.relationships
        : [];
    return rels.some((r) => isRecord(r) && r.id === id);
}

export interface CarryResult {
    carried: string[];
    orphaned: string[];
}

/** Splits comments into those that follow to a new snapshot and those left orphaned. */
export function planCarryForward(
    comments: Array<{
        id: string;
        targetType: CommentTargetType;
        targetId: string;
    }>,
    newContent: unknown
): CarryResult {
    const carried: string[] = [];
    const orphaned: string[] = [];
    for (const c of comments) {
        const list = targetExists(newContent, c.targetType, c.targetId)
            ? carried
            : orphaned;
        list.push(c.id);
    }
    return { carried, orphaned };
}
