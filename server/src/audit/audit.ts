import type { Db } from '../db/client.js';
import { auditLog } from '../db/schema.js';

export type AuditAction =
    | 'user.register'
    | 'user.create'
    | 'user.update'
    | 'user.delete'
    | 'user.disable'
    | 'user.enable'
    | 'project.create'
    | 'project.update'
    | 'project.delete'
    | 'project.member_set'
    | 'project.member_remove'
    | 'diagram.create'
    | 'diagram.update'
    | 'diagram.delete'
    | 'diagram.publish'
    | 'share.create'
    | 'share.update'
    | 'share.revoke'
    | 'share.regenerate'
    | 'comment.create'
    | 'comment.update'
    | 'comment.resolve'
    | 'comment.delete'
    | 'drift.configure'
    | 'drift.check'
    | 'drift.dismiss'
    | 'lint.configure';

/**
 * What an action was done to. Ids and names only: never an email, a token or a
 * password, because audit rows outlive the accounts they mention. Small on
 * purpose (the table has a 1 KB limit per row).
 */
export interface AuditMeta {
    projectId?: string;
    /** the user an admin acted on (not the one who acted: that is user_id) */
    targetUserId?: string;
    role?: 'editor' | 'viewer';
    /** the published version, for diagram.publish */
    version?: number;
    linkId?: string;
    access?: 'anyone' | 'signed_in' | 'off';
    /** the project's name or the diagram's title, for when it no longer exists */
    name?: string;
    /** user.update: what the admin changed */
    changed?: ('password' | 'isAdmin' | 'isActive')[];
}

const MAX_NAME_LENGTH = 100;

/** Drops unset fields and shortens the name; null when nothing is left. */
export function cleanMeta(meta: AuditMeta | undefined): AuditMeta | null {
    if (!meta) return null;
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
        if (value === undefined) continue;
        kept[key] =
            key === 'name' && typeof value === 'string'
                ? value.slice(0, MAX_NAME_LENGTH)
                : value;
    }
    return Object.keys(kept).length > 0 ? (kept as AuditMeta) : null;
}

export async function audit(
    db: Db,
    entry: {
        userId: string;
        action: AuditAction;
        diagramId?: string;
        meta?: AuditMeta;
    }
) {
    await db.insert(auditLog).values({
        userId: entry.userId,
        action: entry.action,
        diagramId: entry.diagramId ?? null,
        meta: cleanMeta(entry.meta),
    });
}
