import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { comments } from '../db/schema.js';
import { latestSnapshot } from '../diagrams/service.js';
import { targetExists } from './targets.js';

// Comments are read-only through the API: the editor has no way to write them
// (the panel and its routes were removed). What remains is the published view
// a share link shows.

type CommentRow = typeof comments.$inferSelect;

/** What viewers see: no author identity, no orphaned comments. */
export const presentForViewer = (c: CommentRow) => ({
    id: c.id,
    targetType: c.targetType,
    targetId: c.targetId,
    body: c.body,
    resolved: c.resolved,
    createdAt: c.createdAt,
});

/**
 * Comments visible on the latest published snapshot: carried to that version,
 * not orphaned, and attached to something that exists in it.
 */
export async function commentsForPublishedView(db: Db, diagramId: string) {
    const snap = await latestSnapshot(db, diagramId);
    if (!snap) return { version: null, comments: [] };
    const rows = await db
        .select()
        .from(comments)
        .where(
            and(
                eq(comments.diagramId, diagramId),
                eq(comments.snapshotVersion, snap.version),
                eq(comments.orphaned, false)
            )
        )
        .orderBy(asc(comments.createdAt));
    return {
        version: snap.version,
        comments: rows
            .filter((c) =>
                targetExists(snap.content, c.targetType, c.targetId)
            )
            .map(presentForViewer),
    };
}
