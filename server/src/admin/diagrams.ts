import { and, count, desc, eq, gt, ilike, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import {
    diagramLocks,
    diagrams,
    projects,
    shareLinks,
    snapshots,
    users,
} from '../db/schema.js';
import {
    containsPattern,
    offsetOf,
    pageOf,
    pagingFields,
    withOffsetCap,
    type Page,
} from '../lib/paging.js';
import { activeLinkSql, linkStatus, type LinkStatus } from '../share/active.js';

/** `?page=&limit=&q=` (matches the title) and `?projectId=`. */
export const adminDiagramsQuery = withOffsetCap(
    pagingFields.extend({
        projectId: z.string().uuid().optional(),
    })
);

export interface AdminDiagram {
    id: string;
    title: string;
    projectId: string;
    projectName: string | null;
    /** the project's web address, so the page can link into the editor */
    projectSlug: string | null;
    ownerId: string;
    ownerEmail: string | null;
    updatedAt: Date;
    /** the newest published version; null if it was never published */
    publishedVersion: number | null;
    /** who has it open for editing right now, if anyone */
    editingBy: { userId: string; email: string | null } | null;
    /** share links that can be opened right now */
    activeLinks: number;
}

const byKey = <T, K>(rows: T[], key: (row: T) => K) =>
    new Map(rows.map((row) => [key(row), row]));

/**
 * One page of every diagram, most recently changed first, with what an admin
 * wants to know about each: where it lives, who owns it, whether it is
 * published, who is editing it and how many share links are open.
 *
 * `content` is a large document, so the page reads only the columns it shows.
 * Everything else comes from lookups by id for this page's diagrams (the
 * primary key of projects and users, the unique (diagram_id, version) index of
 * snapshots, `share_links_diagram_idx`, and the lock table, which holds a row
 * per diagram being edited), not from a join that every row of the table pays
 * for. There is no index on `diagrams.updated_at` on purpose: every autosave
 * changes it, and an index that contains it stops saves from being in-place
 * updates (measured in step 1 of the admin plan). Re-measure the sort below if
 * the table grows into the hundreds of thousands.
 */
export async function listAdminDiagrams(
    db: Db,
    q: z.infer<typeof adminDiagramsQuery>
): Promise<Page<AdminDiagram>> {
    const where = and(
        q.q ? ilike(diagrams.title, containsPattern(q.q)) : undefined,
        q.projectId ? eq(diagrams.projectId, q.projectId) : undefined
    );
    const [{ value: total }] = await db
        .select({ value: count() })
        .from(diagrams)
        .where(where);
    const rows = await db
        .select({
            id: diagrams.id,
            title: diagrams.title,
            projectId: diagrams.projectId,
            ownerId: diagrams.ownerId,
            updatedAt: diagrams.updatedAt,
        })
        .from(diagrams)
        .where(where)
        .orderBy(desc(diagrams.updatedAt), desc(diagrams.id))
        .limit(q.limit)
        .offset(offsetOf(q));
    if (rows.length === 0) return pageOf([], total, q);

    const ids = rows.map((r) => r.id);
    const [projectRows, versions, locks, links] = await Promise.all([
        db
            .select({
                id: projects.id,
                name: projects.name,
                slug: projects.slug,
            })
            .from(projects)
            .where(
                inArray(
                    projects.id,
                    rows.map((r) => r.projectId)
                )
            ),
        db
            .select({
                diagramId: snapshots.diagramId,
                version: sql<number>`max(${snapshots.version})`.mapWith(Number),
            })
            .from(snapshots)
            .where(inArray(snapshots.diagramId, ids))
            .groupBy(snapshots.diagramId),
        db
            .select({
                diagramId: diagramLocks.diagramId,
                userId: diagramLocks.userId,
            })
            .from(diagramLocks)
            // a lease nobody renewed is not someone editing
            .where(
                and(
                    inArray(diagramLocks.diagramId, ids),
                    gt(diagramLocks.expiresAt, new Date())
                )
            ),
        db
            .select({ diagramId: shareLinks.diagramId, n: count() })
            .from(shareLinks)
            .where(and(inArray(shareLinks.diagramId, ids), activeLinkSql()))
            .groupBy(shareLinks.diagramId),
    ]);
    const people = byKey(
        await db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(
                inArray(users.id, [
                    ...new Set([
                        ...rows.map((r) => r.ownerId),
                        ...locks.map((l) => l.userId),
                    ]),
                ])
            ),
        (u) => u.id
    );

    const projectsById = byKey(projectRows, (p) => p.id);
    const versionOf = byKey(versions, (v) => v.diagramId);
    const lockOf = byKey(locks, (l) => l.diagramId);
    const linksOf = byKey(links, (l) => l.diagramId);

    return pageOf(
        rows.map((r): AdminDiagram => {
            const lock = lockOf.get(r.id);
            return {
                id: r.id,
                title: r.title,
                projectId: r.projectId,
                projectName: projectsById.get(r.projectId)?.name ?? null,
                projectSlug: projectsById.get(r.projectId)?.slug ?? null,
                ownerId: r.ownerId,
                ownerEmail: people.get(r.ownerId)?.email ?? null,
                updatedAt: r.updatedAt,
                publishedVersion: versionOf.get(r.id)?.version ?? null,
                editingBy: lock
                    ? {
                          userId: lock.userId,
                          email: people.get(lock.userId)?.email ?? null,
                      }
                    : null,
                activeLinks: linksOf.get(r.id)?.n ?? 0,
            };
        }),
        total,
        q
    );
}

export interface AdminShareLink {
    id: string;
    access: 'anyone' | 'signed_in' | 'off';
    live: boolean;
    expiresAt: Date | null;
    createdAt: Date;
    revokedAt: Date | null;
    createdById: string | null;
    createdByEmail: string | null;
    status: LinkStatus;
}

/** The most links of one diagram shown at once; a diagram has a handful. */
export const MAX_LINKS_SHOWN = 100;

/**
 * A diagram's share links, newest first. Never the token or its hash: the
 * address is shown once, to whoever made the link, and not stored.
 */
export async function listDiagramLinks(
    db: Db,
    diagramId: string
): Promise<AdminShareLink[]> {
    const rows = await db
        .select({
            id: shareLinks.id,
            access: shareLinks.access,
            live: shareLinks.live,
            expiresAt: shareLinks.expiresAt,
            createdAt: shareLinks.createdAt,
            revokedAt: shareLinks.revokedAt,
            createdById: shareLinks.createdBy,
            createdByEmail: users.email,
        })
        .from(shareLinks)
        .leftJoin(users, eq(users.id, shareLinks.createdBy))
        .where(eq(shareLinks.diagramId, diagramId))
        .orderBy(desc(shareLinks.createdAt))
        .limit(MAX_LINKS_SHOWN);
    const now = new Date();
    return rows.map((r) => ({ ...r, status: linkStatus(r, now) }));
}
