import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { comments, diagrams, snapshots } from '../db/schema.js';
import { planCarryForward } from '../comments/targets.js';
import { diagramHash } from '../lib/hash.js';
import { snapshotStatsColumns } from './summary.js';
import { emitPublish } from '../events.js';
import { canWrite, type Role } from './permissions.js';

type DiagramRow = typeof diagrams.$inferSelect;
type SnapshotRow = typeof snapshots.$inferSelect;

export async function latestSnapshot(
    db: Db,
    diagramId: string
): Promise<SnapshotRow | undefined> {
    const [row] = await db
        .select()
        .from(snapshots)
        .where(eq(snapshots.diagramId, diagramId))
        .orderBy(desc(snapshots.version))
        .limit(1);
    return row;
}

/** The latest snapshot without its (large) content. */
export async function latestSnapshotMeta(db: Db, diagramId: string) {
    const [row] = await db
        .select({
            version: snapshots.version,
            publishedAt: snapshots.publishedAt,
            contentHash: snapshots.contentHash,
        })
        .from(snapshots)
        .where(eq(snapshots.diagramId, diagramId))
        .orderBy(desc(snapshots.version))
        .limit(1);
    return row;
}

/**
 * What the list shows of each given diagram's latest snapshot: title, publish
 * time and the stats computed in the database, never the content itself.
 */
export async function latestSnapshotListing(db: Db, diagramIds: string[]) {
    if (diagramIds.length === 0) return new Map();
    const rows = await db
        .selectDistinctOn([snapshots.diagramId], {
            diagramId: snapshots.diagramId,
            title: snapshots.title,
            publishedAt: snapshots.publishedAt,
            ...snapshotStatsColumns,
        })
        .from(snapshots)
        .where(inArray(snapshots.diagramId, diagramIds))
        .orderBy(snapshots.diagramId, desc(snapshots.version));
    return new Map(rows.map((r) => [r.diagramId, r]));
}

/**
 * What a member is allowed to see. Writers get the working copy; viewers only
 * ever get the latest published snapshot (or no content if nothing is published).
 */
export async function presentDiagram(db: Db, d: DiagramRow, role: Role) {
    const common = { id: d.id, ownerId: d.ownerId, projectId: d.projectId, role };
    if (canWrite(role)) {
        // a writer needs the snapshot's version and hash, not its content
        const last = await latestSnapshotMeta(db, d.id);
        return {
            ...common,
            publishedVersion: last?.version ?? null,
            publishedAt: last?.publishedAt ?? null,
            title: d.title,
            content: d.content,
            updatedAt: d.updatedAt,
            autoPublish: d.autoPublish,
            unpublishedChanges:
                !last || last.contentHash !== diagramHash(d.title, d.content),
        };
    }
    const last = await latestSnapshot(db, d.id);
    return {
        ...common,
        publishedVersion: last?.version ?? null,
        publishedAt: last?.publishedAt ?? null,
        title: last?.title ?? d.title,
        content: last?.content ?? null,
        updatedAt: last?.publishedAt ?? d.updatedAt,
    };
}

/**
 * Creates the next snapshot. Locks the diagram row so concurrent publishes get
 * consecutive version numbers. With `onlyIfChanged`, returns null when the
 * working copy already matches the latest snapshot.
 */
export async function publishSnapshot(
    db: Db,
    diagramId: string,
    userId: string,
    opts: {
        note?: string | null;
        onlyIfChanged?: boolean;
        /** keep only this many newest snapshots; 0 or unset keeps all */
        keep?: number
    } = {}
): Promise<SnapshotRow | null> {
    const row = await db.transaction(async (tx) => {
        const [d] = await tx
            .select()
            .from(diagrams)
            .where(eq(diagrams.id, diagramId))
            .for('update');
        if (!d) return null;
        const [last] = await tx
            .select()
            .from(snapshots)
            .where(eq(snapshots.diagramId, diagramId))
            .orderBy(desc(snapshots.version))
            .limit(1);
        const hash = diagramHash(d.title, d.content);
        if (opts.onlyIfChanged && last?.contentHash === hash) return null;
        const [created] = await tx
            .insert(snapshots)
            .values({
                diagramId,
                version: (last?.version ?? 0) + 1,
                title: d.title,
                content: d.content,
                contentHash: hash,
                publishedBy: userId,
                note: opts.note ?? null,
            })
            .returning();

        // retention: versions are consecutive, so everything this far back goes
        if (opts.keep && opts.keep > 0) {
            await tx
                .delete(snapshots)
                .where(
                    and(
                        eq(snapshots.diagramId, diagramId),
                        lte(snapshots.version, created.version - opts.keep)
                    )
                );
        }

        // comments follow the diagram to the new version while their target
        // exists; the rest are flagged as orphaned, never deleted
        const existing = await tx
            .select({
                id: comments.id,
                targetType: comments.targetType,
                targetId: comments.targetId,
            })
            .from(comments)
            .where(eq(comments.diagramId, diagramId));
        const plan = planCarryForward(existing, d.content);
        if (plan.carried.length > 0) {
            await tx
                .update(comments)
                .set({ snapshotVersion: created.version, orphaned: false })
                .where(inArray(comments.id, plan.carried));
        }
        if (plan.orphaned.length > 0) {
            await tx
                .update(comments)
                .set({ orphaned: true })
                .where(inArray(comments.id, plan.orphaned));
        }
        return created;
    });
    if (row) emitPublish(diagramId, row.version);
    return row;
}
