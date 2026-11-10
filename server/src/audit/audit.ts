import { and, eq, gt, sql } from 'drizzle-orm';
import type { Db, Tx } from '../db/client.js';
import { auditLog } from '../db/schema.js';
import { requestIds } from './request-context.js';

export const AUDIT_ACTIONS = [
    'user.register',
    'user.create',
    'user.update',
    'user.delete',
    'user.disable',
    'user.enable',
    'user.sign_out',
    'user.sign_in',
    'user.logout',
    'user.sign_in_failed',
    'user.password_check_failed',
    'user.locked',
    'user.password_change',
    'mfa.setup',
    'mfa.enable',
    'mfa.disable',
    'mfa.reset',
    'mfa.recovery_used',
    'mfa.recovery_renew',
    'mfa.failed',
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
    'introspect.run',
    'audit.export',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * The Activity page's "what kind" filter. A group is every action that starts
 * with its prefix (`user.`), so a new action lands in the right group by its
 * name; `test/admin-audit.test.ts` fails if one fits none.
 */
export const AUDIT_GROUPS = {
    users: ['user.', 'mfa.'],
    // a saved connection belongs to a project
    projects: ['project.', 'connection.'],
    diagrams: ['diagram.'],
    sharing: ['share.'],
    checks: ['drift.', 'lint.', 'introspect.'],
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
    /** share.update: the link's expiry after the change (ISO, or null for none), when the request touched it */
    expiresAt?: string | null;
    /** share.update: whether the link follows the diagram live, when the request touched it */
    live?: boolean;
    /** share.revoke: when the link was made (ISO), to tell links apart */
    madeAt?: string;
    /** the project's name or the diagram's title, for when it no longer exists */
    name?: string;
    /** introspect.run: the kind of database and the host it was read from */
    dialect?: 'postgresql' | 'sqlserver';
    host?: string;
    /** audit.export: how many rows the file held */
    rows?: number;
    /** drift.configure: what the request did to the webhook, if it touched it (its host goes in `host`) */
    webhook?: 'set' | 'changed' | 'cleared';
    /** audit.export: the filters the file was cut with (set ones only) */
    filters?: {
        group?: string;
        action?: string;
        userId?: string;
        diagramId?: string;
        /** ISO times */
        from?: string;
        to?: string;
        saves?: 'hide';
    };
    /** user.update: what the admin changed */
    changed?: ('password' | 'isAdmin' | 'isActive')[];
    /** user.update: the admin flag after the change, when it changed (true is a grant, false a revoke) */
    isAdmin?: boolean;
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

/** A transaction handle has `rollback`; the pool's `db` does not. */
const inTransaction = (db: Db | Tx): boolean => 'rollback' in db;

const logLost = (what: string, err: unknown) => {
    const id = requestIds.getStore();
    console.error(
        `Audit row lost (${what})${id ? ` [request ${id}]` : ''}:`,
        err instanceof Error ? err.message : err
    );
};

/**
 * Writes one audit row. The rule:
 * - inside a transaction (`Tx`) the row is part of the action, so a failed
 *   insert fails it and rolls the action back: the log is the point there;
 * - on the plain `db` the action is already done, so a failed insert is logged
 *   with the request id and the answer stays what the action earned, not a 500
 *   for something that happened.
 */
export async function audit(db: Db | Tx, entry: AuditEntry) {
    if (inTransaction(db)) {
        await db.insert(auditLog).values(toRow(entry));
        return;
    }
    try {
        await db.insert(auditLog).values(toRow(entry));
    } catch (err) {
        logLost(entry.action, err);
    }
}

/**
 * A save's `diagram.update` row, at most once every `everyMinutes` for one
 * person and diagram: the editor saves every few seconds while someone types,
 * and the log would otherwise grow by a row (and five index entries) for each.
 * 0 logs every save.
 */
export async function auditDiagramSave(
    db: Db,
    entry: { userId: string; diagramId: string },
    everyMinutes: number
) {
    if (everyMinutes === 0) {
        await audit(db, { ...entry, action: 'diagram.update' });
        return;
    }
    // look and write under one lock per person and diagram: two saves at the
    // same moment would both find no recent row and each write one
    try {
        await db.transaction(async (tx) => {
            await tx.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${`audit-save:${entry.userId}:${entry.diagramId}`}, 0))`
            );
            const recent = await tx
                .select({ id: auditLog.id })
                .from(auditLog)
                .where(
                    and(
                        eq(auditLog.diagramId, entry.diagramId),
                        eq(auditLog.userId, entry.userId),
                        eq(auditLog.action, 'diagram.update'),
                        gt(
                            auditLog.at,
                            new Date(Date.now() - everyMinutes * 60_000)
                        )
                    )
                )
                .limit(1);
            if (recent.length === 0)
                await audit(tx, { ...entry, action: 'diagram.update' });
        });
    } catch (err) {
        // the save is already stored: its log row is not worth failing it for
        logLost('diagram.update', err);
    }
}

/** Several rows in one statement, for an action done to many things at once. */
export async function auditMany(db: Db | Tx, entries: AuditEntry[]) {
    if (entries.length === 0) return;
    if (inTransaction(db)) {
        await db.insert(auditLog).values(entries.map(toRow));
        return;
    }
    try {
        await db.insert(auditLog).values(entries.map(toRow));
    } catch (err) {
        logLost(`${entries[0].action} x${entries.length}`, err);
    }
}
