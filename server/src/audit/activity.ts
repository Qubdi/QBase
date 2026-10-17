import { and, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { auditLog, diagrams, projects, users } from '../db/schema.js';
import {
    actionsInGroup,
    AUDIT_GROUP_NAMES,
    type AuditMeta,
} from './audit.js';

export const ACTIVITY_DEFAULT_LIMIT = 30;
export const ACTIVITY_MAX_LIMIT = 100;

/**
 * Where the next page starts: the (at, id) of the last row of this one. The
 * time keeps its microseconds, because that is what the database stores and
 * compares: a JavaScript Date stops at milliseconds, and a cursor cut there
 * would skip the rows that fall between the two.
 */
export interface ActivityCursor {
    at: string;
    id: number;
}

const CURSOR_PATTERN =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)\|(\d{1,16})$/;

/** Opaque to the client, so the shape can change without it noticing. */
export const encodeCursor = (c: ActivityCursor): string =>
    Buffer.from(`${c.at}|${c.id}`).toString('base64url');

export const decodeCursor = (text: string): ActivityCursor | null => {
    const match = CURSOR_PATTERN.exec(
        Buffer.from(text, 'base64url').toString('utf8')
    );
    if (!match) return null;
    const id = Number(match[2]);
    // the value goes into a query as a timestamp, so it must really be one
    if (Number.isNaN(Date.parse(match[1]))) return null;
    return Number.isSafeInteger(id) ? { at: match[1], id } : null;
};

export const activityQuery = z.object({
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(ACTIVITY_MAX_LIMIT)
        .default(ACTIVITY_DEFAULT_LIMIT),
    cursor: z
        .string()
        .max(120)
        .transform((text, ctx) => {
            const cursor = decodeCursor(text);
            if (!cursor) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'not a cursor this server issued',
                });
                return z.NEVER;
            }
            return cursor;
        })
        .optional(),
    /** what kind: users, projects, diagrams, sharing, checks or comments */
    group: z.enum(AUDIT_GROUP_NAMES).optional(),
    /** one exact action, such as diagram.publish */
    action: z.string().trim().max(60).optional(),
    userId: z.string().uuid().optional(),
    diagramId: z.string().uuid().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    /**
     * A save is a row of its own and by far the most frequent action, so a
     * list of what people did is easier to read without them. The API shows
     * everything unless asked.
     */
    saves: z.enum(['show', 'hide']).default('show'),
});

export type ActivityQuery = z.infer<typeof activityQuery>;

export interface ActivityItem {
    id: number;
    at: Date;
    action: string;
    /** who did it; the email is null once that account is deleted */
    userId: string | null;
    userEmail: string | null;
    diagramId: string | null;
    /** the diagram's title now, or the one recorded if it has been deleted */
    diagramTitle: string | null;
    projectId: string | null;
    projectName: string | null;
    /** the person an admin acted on (not the one who acted) */
    targetUserId: string | null;
    targetUserEmail: string | null;
    meta: AuditMeta | null;
}

export interface ActivityPage {
    items: ActivityItem[];
    /** pass as `cursor` to get the next, older page; null on the last one */
    nextCursor: string | null;
}

const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The distinct ids that really are ids: a value in `meta` must never break the page. */
const idsOf = (values: (string | null | undefined)[]): string[] => [
    ...new Set(values.filter((v): v is string => !!v && UUID.test(v))),
];

const byId = async <T extends { id: string }>(
    ids: string[],
    load: (ids: string[]) => Promise<T[]>
): Promise<Map<string, T>> =>
    new Map((ids.length > 0 ? await load(ids) : []).map((row) => [row.id, row]));

/**
 * One page of the audit log, newest first, with the names behind the ids.
 *
 * The page itself reads `audit_log` alone, in the order of `audit_log_at_id_idx`
 * (or the filter's index), and stops at the limit: there is no count, so it
 * costs the same on the first page and the thousandth. The names come from
 * three small lookups by primary key, never from `select *` (a diagram's
 * `content` is a large document). Audit rows have no foreign keys on purpose,
 * so a row whose user, project or diagram is gone still reads: its email is
 * null and the name falls back to the one recorded in `meta`.
 */
export async function listActivity(
    db: Db,
    q: ActivityQuery
): Promise<ActivityPage> {
    const where = and(
        q.group ? inArray(auditLog.action, actionsInGroup(q.group)) : undefined,
        q.action ? eq(auditLog.action, q.action) : undefined,
        q.userId ? eq(auditLog.userId, q.userId) : undefined,
        q.diagramId ? eq(auditLog.diagramId, q.diagramId) : undefined,
        q.from ? gte(auditLog.at, q.from) : undefined,
        q.to ? lte(auditLog.at, q.to) : undefined,
        q.saves === 'hide' ? ne(auditLog.action, 'diagram.update') : undefined,
        q.cursor
            ? sql`(${auditLog.at}, ${auditLog.id}) < (${q.cursor.at}::timestamptz, ${q.cursor.id})`
            : undefined
    );

    // one more than asked for, to know whether another page exists
    const rows = await db
        .select({
            id: auditLog.id,
            at: auditLog.at,
            // the same instant as `at`, with the microseconds a Date would lose
            atKey: sql<string>`to_char(${auditLog.at} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
            action: auditLog.action,
            userId: auditLog.userId,
            diagramId: auditLog.diagramId,
            meta: auditLog.meta,
        })
        .from(auditLog)
        .where(where)
        .orderBy(desc(auditLog.at), desc(auditLog.id))
        .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;

    const userIds = idsOf(page.flatMap((r) => [r.userId, r.meta?.targetUserId]));
    const diagramIds = idsOf(page.map((r) => r.diagramId));
    const projectIds = idsOf(page.map((r) => r.meta?.projectId));
    const [emails, titles, names] = await Promise.all([
        byId(userIds, (ids) =>
            db
                .select({ id: users.id, email: users.email })
                .from(users)
                .where(inArray(users.id, ids))
        ),
        byId(diagramIds, (ids) =>
            db
                .select({ id: diagrams.id, title: diagrams.title })
                .from(diagrams)
                .where(inArray(diagrams.id, ids))
        ),
        byId(projectIds, (ids) =>
            db
                .select({ id: projects.id, name: projects.name })
                .from(projects)
                .where(inArray(projects.id, ids))
        ),
    ]);

    const items = page.map((r): ActivityItem => {
        const projectId = r.meta?.projectId ?? null;
        const targetUserId = r.meta?.targetUserId ?? null;
        // `meta.name` is the diagram's title on diagram.* rows and the
        // project's name on project.* rows
        const recorded = r.meta?.name ?? null;
        return {
            id: r.id,
            at: r.at,
            action: r.action,
            userId: r.userId,
            userEmail: (r.userId && emails.get(r.userId)?.email) || null,
            diagramId: r.diagramId,
            diagramTitle:
                (r.diagramId && titles.get(r.diagramId)?.title) ||
                (r.action.startsWith('diagram.') ? recorded : null),
            projectId,
            projectName:
                (projectId && names.get(projectId)?.name) ||
                (r.action.startsWith('project.') ? recorded : null),
            targetUserId,
            targetUserEmail:
                (targetUserId && emails.get(targetUserId)?.email) || null,
            meta: r.meta,
        };
    });

    const last = page.at(-1);
    return {
        items,
        nextCursor:
            hasMore && last
                ? encodeCursor({ at: last.atKey, id: last.id })
                : null,
    };
}
