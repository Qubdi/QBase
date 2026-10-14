import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
    diagramMembers,
    diagrams,
    projectMembers,
    users,
} from '../db/schema.js';

export type Role = 'owner' | 'editor' | 'viewer';

export const canWrite = (role: Role) => role === 'owner' || role === 'editor';

/** The project a diagram belongs to, or null for a standalone diagram. */
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
 * Role of a user on a diagram. Diagrams inside a project are governed by the
 * project: admins are owners, everyone else gets their project role. Standalone
 * diagrams keep per-diagram membership.
 */
export async function getRole(
    db: Db,
    diagramId: string,
    userId: string
): Promise<Role | null> {
    const projectId = await getDiagramProject(db, diagramId);
    if (projectId) return getProjectRole(db, projectId, userId);
    const rows = await db
        .select({ role: diagramMembers.role })
        .from(diagramMembers)
        .where(
            and(
                eq(diagramMembers.diagramId, diagramId),
                eq(diagramMembers.userId, userId)
            )
        );
    return rows[0]?.role ?? null;
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
