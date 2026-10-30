import { and, desc, eq, inArray, isNull, lte } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { diagrams, snapshots } from '../db/schema.js';
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
/** The hash of a diagram's title and content: the stored one, filled in first if the row has none yet. */
async function currentHash(db: Db, d: DiagramRow): Promise<string> {
    if (d.contentHash) return d.contentHash;
    const hash = diagramHash(d.title, d.content);
    // best effort and only into an empty slot: a save that landed meanwhile keeps its own
    await db
        .update(diagrams)
        .set({ contentHash: hash })
        .where(and(eq(diagrams.id, d.id), isNull(diagrams.contentHash)))
        .catch(() => undefined);
    return hash;
}

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
                !last || last.contentHash !== (await currentHash(db, d)),
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
        // only the version and hash of the last snapshot: its content, up to
        // 50 MB, is not needed
        const [last] = await tx
            .select({
                version: snapshots.version,
                contentHash: snapshots.contentHash,
            })
            .from(snapshots)
            .where(eq(snapshots.diagramId, diagramId))
            .orderBy(desc(snapshots.version))
            .limit(1);
        // every save keeps the hash current; a rename alone leaves it empty
        const hash = d.contentHash ?? diagramHash(d.title, d.content);
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

        return created;
    });
    if (row) emitPublish(diagramId, row.version);
    return row;
}
