import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { diagramMembers } from '../db/schema.js';

export type Role = 'owner' | 'editor' | 'viewer';

export const canWrite = (role: Role) => role === 'owner' || role === 'editor';

export async function getRole(
    db: Db,
    diagramId: string,
    userId: string
): Promise<Role | null> {
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
