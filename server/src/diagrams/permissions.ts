import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { diagrams, projectMembers, users } from '../db/schema.js';

export type Role = 'owner' | 'editor' | 'viewer';

export const canWrite = (role: Role) => role === 'owner' || role === 'editor';

/** The project a diagram belongs to (every diagram has one). */
export async function getDiagramProject(
    db: Db,
    diagramId: string
): Promise<string | null> {
    const rows = await db
        .select({ projectId: diagrams.projectId })
        .from(diagrams)
        .where(eq(diagrams.id, diagramId));
    return rows[0]?.projectId ?? null;
}

/**
 * Role of a user on a diagram. Access comes only from the diagram's project:
 * admins are owners, everyone else gets the role an admin granted them there.
 */
export async function getRole(
    db: Db,
    diagramId: string,
    userId: string
): Promise<Role | null> {
    const projectId = await getDiagramProject(db, diagramId);
    if (!projectId) return null;
    return getProjectRole(db, projectId, userId);
}

/**
 * Whether a user may write in at least one project: an admin, or a member
 * with the editor role somewhere. Viewers and users without any
 * project may not.
 */
export async function canWriteAnywhere(
    db: Db,
    userId: string
): Promise<boolean> {
    const [user] = await db
        .select({ isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, userId));
    if (!user) return false;
    if (user.isAdmin) return true;
    const rows = await db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(
            and(
                eq(projectMembers.userId, userId),
                eq(projectMembers.role, 'editor')
            )
        )
        .limit(1);
    return rows.length > 0;
}

/** Admins are owners of every project; others get their granted role. */
export async function getProjectRole(
    db: Db,
    projectId: string,
    userId: string
): Promise<Role | null> {
    const [user] = await db
        .select({ isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, userId));
    if (!user) return null;
    if (user.isAdmin) return 'owner';
    const rows = await db
        .select({ role: projectMembers.role })
        .from(projectMembers)
        .where(
            and(
                eq(projectMembers.projectId, projectId),
                eq(projectMembers.userId, userId)
            )
        );
    return rows[0]?.role ?? null;
}
