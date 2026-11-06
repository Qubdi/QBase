import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
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
    // The newest version of each diagram is found from the index alone; only
    // those rows are then read, so the numbers are taken from one content per
    // diagram, not from every version it ever had.
    const newest = db
        .select({
            diagramId: snapshots.diagramId,
            newestVersion: sql<number>`max(${snapshots.version})`.as('newest_version'),
        })
        .from(snapshots)
        .where(inArray(snapshots.diagramId, diagramIds))
        .groupBy(snapshots.diagramId)
        .as('newest');
    const rows = await db
        .select({
            diagramId: snapshots.diagramId,
            title: snapshots.title,
            publishedAt: snapshots.publishedAt,
            ...snapshotStatsColumns,
        })
        .from(snapshots)
        .innerJoin(
            newest,
            and(
                eq(snapshots.diagramId, newest.diagramId),
                eq(snapshots.version, newest.newestVersion)
            )
        );
    return new Map(rows.map((r) => [r.diagramId, r]));
}

/**
 * What a member is allowed to see. Writers get the working copy; viewers only
 * ever get the latest published snapshot (or no content if nothing is published).
 */
/**
 * The hash of a diagram's title and content: the stored one, filled in first
 * if the row has none yet. A row that comes without its content has it read
 * only in that case.
 */
async function currentHash(
    db: Db,
    d: Pick<DiagramRow, 'id' | 'title' | 'contentHash'> & { content?: unknown }
): Promise<string> {
    if (d.contentHash) return d.contentHash;
    const content =
        'content' in d
            ? d.content
            : (
                  await db
                      .select({ content: diagrams.content })
                      .from(diagrams)
                      .where(eq(diagrams.id, d.id))
              )[0]?.content;
    const hash = diagramHash(d.title, content);
    // best effort and only into an empty slot: a save that landed meanwhile keeps its own
    await db
        .update(diagrams)
        .set({ contentHash: hash })
        .where(and(eq(diagrams.id, d.id), isNull(diagrams.contentHash)))
        .catch(() => undefined);
    return hash;
}

/** What a save answers with: the diagram without its content, which the editor just sent. */
export type SavedDiagram = Pick<
    DiagramRow,
    | 'id'
    | 'ownerId'
    | 'projectId'
    | 'title'
    | 'updatedAt'
    | 'autoPublish'
    | 'contentHash'
>;

export async function presentSaved(db: Db, d: SavedDiagram, role: Role) {
    const last = await latestSnapshotMeta(db, d.id);
    return {
        id: d.id,
        ownerId: d.ownerId,
        projectId: d.projectId,
        role,
        publishedVersion: last?.version ?? null,
        publishedAt: last?.publishedAt ?? null,
        title: d.title,
        updatedAt: d.updatedAt,
        autoPublish: d.autoPublish,
        unpublishedChanges:
            !last || last.contentHash !== (await currentHash(db, d)),
    };
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
        // nothing published: nothing of the working copy, not even its title
        title: last?.title ?? '',
        content: last?.content ?? null,
        updatedAt: last?.publishedAt ?? null,
    };
}

/** The note of a snapshot made by auto-publish, which is the one kind that may be rewritten. */
export const AUTO_PUBLISH_NOTE = 'Auto-published on save';

export type SnapshotMeta = Omit<SnapshotRow, 'content' | 'auto'>;

const snapshotMetaColumns = {
    id: snapshots.id,
    diagramId: snapshots.diagramId,
    version: snapshots.version,
    title: snapshots.title,
    contentHash: snapshots.contentHash,
    publishedBy: snapshots.publishedBy,
    publishedAt: snapshots.publishedAt,
    note: snapshots.note,
};

/**
 * Creates the next snapshot. Locks the diagram row so concurrent publishes get
 * consecutive version numbers. With `onlyIfChanged`, returns null when the
 * working copy already matches the latest snapshot. The content is copied
 * inside the database and never travels through this process.
 */
export async function publishSnapshot(
    db: Db,
    diagramId: string,
    userId: string,
    opts: {
        note?: string | null;
        onlyIfChanged?: boolean;
        /** keep only this many newest snapshots; 0 or unset keeps all */
        keep?: number;
        /**
         * When the latest snapshot is this same person's auto-publish from less
         * than this many seconds ago, it is rewritten instead of followed by
         * another copy: auto-publish saves every few seconds while someone
         * types. 0 or unset: always a new snapshot.
         */
        coalesceSeconds?: number;
        /** this snapshot is an auto-publish: it may be rewritten by the next one */
        auto?: boolean;
    } = {}
): Promise<(SnapshotMeta & { coalesced: boolean }) | null> {
    const row = await db.transaction(async (tx) => {
        // the row stays locked; only what is needed is read from it
        const [d] = await tx
            .select({
                title: diagrams.title,
                contentHash: diagrams.contentHash,
            })
            .from(diagrams)
            .where(eq(diagrams.id, diagramId))
            .for('update');
        if (!d) return null;
        // not the last snapshot's content, up to 50 MB: it is not needed
        const [last] = await tx
            .select({
                id: snapshots.id,
                version: snapshots.version,
                contentHash: snapshots.contentHash,
                note: snapshots.note,
                auto: snapshots.auto,
                publishedBy: snapshots.publishedBy,
                publishedAt: snapshots.publishedAt,
            })
            .from(snapshots)
            .where(eq(snapshots.diagramId, diagramId))
            .orderBy(desc(snapshots.version))
            .limit(1);
        // every save keeps the hash current; a rename alone leaves it empty
        const hash =
            d.contentHash ??
            diagramHash(
                d.title,
                (
                    await tx
                        .select({ content: diagrams.content })
                        .from(diagrams)
                        .where(eq(diagrams.id, diagramId))
                )[0]?.content
            );
        if (opts.onlyIfChanged && last?.contentHash === hash) return null;

        const note = opts.note ?? null;
        if (
            opts.coalesceSeconds &&
            last &&
            opts.auto &&
            last.auto &&
            last.publishedBy === userId &&
            Date.now() - last.publishedAt.getTime() <
                opts.coalesceSeconds * 1000
        ) {
            await tx.execute(sql`
                update snapshots
                set title = d.title, content = d.content,
                    content_hash = ${hash}::text, published_at = now()
                from diagrams d
                where d.id = ${diagramId}::uuid and snapshots.id = ${last.id}::uuid
            `);
            const [meta] = await tx
                .select(snapshotMetaColumns)
                .from(snapshots)
                .where(eq(snapshots.id, last.id));
            return { ...meta, coalesced: true };
        }

        const version = (last?.version ?? 0) + 1;
        const inserted = await tx.execute<{ id: string }>(sql`
            insert into snapshots
                (diagram_id, version, title, content, content_hash, published_by, note, auto)
            select d.id, ${version}::integer, d.title, d.content, ${hash}::text,
                   ${userId}::uuid, ${note}::text, ${opts.auto ?? false}::boolean
            from diagrams d
            where d.id = ${diagramId}::uuid
            returning id
        `);
        const [meta] = await tx
            .select(snapshotMetaColumns)
            .from(snapshots)
            .where(eq(snapshots.id, inserted.rows[0].id));

        // retention: versions are consecutive, so everything this far back goes
        if (opts.keep && opts.keep > 0) {
            await tx
                .delete(snapshots)
                .where(
                    and(
                        eq(snapshots.diagramId, diagramId),
                        lte(snapshots.version, version - opts.keep)
                    )
                );
        }

        return { ...meta, coalesced: false };
    });
    if (row) emitPublish(diagramId, row.version);
    return row;
}
