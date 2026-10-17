import type { Db } from '../db/client.js';
import { auditLog } from '../db/schema.js';

export const AUDIT_ACTIONS = [
    'user.register',
    'user.create',
    'user.update',
    'user.delete',
    'user.disable',
    'user.enable',
    'user.sign_out',
    'user.sign_in',
    'user.sign_in_failed',
    'user.password_change',
    'project.create',
    'project.update',
    'project.delete',
    'project.member_set',
    'project.member_remove',
    'diagram.create',
    'diagram.update',
    'diagram.delete',
    'diagram.publish',
    'share.create',
    'share.update',
    'share.revoke',
    'share.regenerate',
    'connection.create',
    'connection.update',
    'connection.delete',
    'drift.configure',
    'drift.check',
    'drift.dismiss',
    'lint.configure',
    'audit.export',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * The Activity page's "what kind" filter. A group is every action that starts
 * with its prefix (`user.`), so a new action lands in the right group by its
 * name; `test/admin-audit.test.ts` fails if one fits none.
 */
export const AUDIT_GROUPS = {
    users: ['user.'],
    // a saved connection belongs to a project
    projects: ['project.', 'connection.'],
    diagrams: ['diagram.'],
    sharing: ['share.'],
    checks: ['drift.', 'lint.'],
    // an admin took a copy of the log
    exports: ['audit.'],
} as const satisfies Record<string, readonly string[]>;

export type AuditGroup = keyof typeof AUDIT_GROUPS;

export const AUDIT_GROUP_NAMES = Object.keys(AUDIT_GROUPS) as [
    AuditGroup,
    ...AuditGroup[],
];

/** The actions that belong to a group, for an `action in (...)` filter. */
export const actionsInGroup = (group: AuditGroup): AuditAction[] =>
    AUDIT_ACTIONS.filter((action) =>
        AUDIT_GROUPS[group].some((prefix) => action.startsWith(prefix))
    );

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
    /** share.revoke: when the link was made (ISO), to tell links apart */
    madeAt?: string;
    /** the project's name or the diagram's title, for when it no longer exists */
    name?: string;
    /** audit.export: how many rows the file held */
    rows?: number;
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

export interface AuditEntry {
    userId: string;
    action: AuditAction;
    diagramId?: string;
    meta?: AuditMeta;
}

const toRow = (entry: AuditEntry) => ({
    userId: entry.userId,
    action: entry.action,
    diagramId: entry.diagramId ?? null,
    meta: cleanMeta(entry.meta),
});

export async function audit(db: Db, entry: AuditEntry) {
    await db.insert(auditLog).values(toRow(entry));
}

/** Several rows in one statement, for an action done to many things at once. */
export async function auditMany(db: Db, entries: AuditEntry[]) {
    if (entries.length === 0) return;
    await db.insert(auditLog).values(entries.map(toRow));
}
