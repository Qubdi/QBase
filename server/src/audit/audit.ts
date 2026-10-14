import type { Db } from '../db/client.js';
import { auditLog } from '../db/schema.js';

export type AuditAction =
    | 'user.register'
    | 'user.create'
    | 'user.update'
    | 'user.delete'
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
    | 'lint.configure'
    | 'member.add'
    | 'member.role_change'
    | 'member.remove';

export async function audit(
    db: Db,
    entry: { userId: string; action: AuditAction; diagramId?: string }
) {
    await db.insert(auditLog).values({
        userId: entry.userId,
        action: entry.action,
        diagramId: entry.diagramId ?? null,
    });
}
