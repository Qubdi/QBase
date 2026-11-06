import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { AUDIT_ACTIONS } from '../audit/audit.js';
import type { Db } from '../db/client.js';
import {
    auditLog,
    diagramLocks,
    diagrams,
    projects,
    sessions,
    shareLinks,
    snapshots,
    users,
} from '../db/schema.js';
import { activeLinkSql } from '../share/active.js';

/** How many days the activity chart covers, today included. */
export const ACTIVITY_DAYS = 7;

const KNOWN_ZONES = new Set<string>([
    'UTC',
    ...Intl.supportedValuesOf('timeZone'),
]);

/** `?tz=Asia/Tbilisi`: the viewer's time zone, so a "day" is theirs. UTC by default. */
export const statsQuery = z.object({
    tz: z
        .string()
        .max(64)
        .refine((zone) => KNOWN_ZONES.has(zone), 'not a time zone')
        .default('UTC'),
});

export interface AdminStats {
    users: {
        total: number;
        /** accounts that can sign in */
        active: number;
        admins: number;
        /** people with a live session right now */
        signedIn: number;
    };
    projects: number;
    diagrams: {
        total: number;
        /** diagrams with at least one published version */
        published: number;
    };
    /** share links that can be opened right now */
    activeLinks: number;
    /** diagrams someone has open for editing right now */
    editingNow: number;
    /** database drift checks run in the last 24 hours */
    driftChecks24h: number;
    activity: {
        timeZone: string;
        /** oldest first, today last; a day with nothing has 0 */
        days: { day: string; events: number }[];
    };
}

// Saves are a row of their own and by far the most frequent action: a chart
// that counted them would only show how long people kept a diagram open. They
// are also left out of the query itself, so it reads the index of the other
// actions and never walks through the saves.
const EVENT_ACTIONS = AUDIT_ACTIONS.filter((a) => a !== 'diagram.update');

const DAY_MS = 86_400_000;

/**
 * The figures on the admin Overview. The counts are one statement, so the page
 * takes one pooled connection for them instead of one each; the chart is its
 * own query. The counts are answered from an index or from a table that is
 * small (users, sessions, locks, projects); the drift checks and the daily
 * chart read the log's index (`audit_log_action_at_idx`).
 */
export async function adminStats(db: Db, timeZone: string): Promise<AdminStats> {
    const [counts, activity] = await Promise.all([
        db.execute<{
            users_total: number;
            users_active: number;
            users_admins: number;
            signed_in: number;
            projects: number;
            diagrams: number;
            published: number;
            links: number;
            editing: number;
            checks: number;
        }>(sql`
            select
                (select count(*) from ${users})::int as users_total,
                (select count(*) from ${users} where ${users.isActive})::int as users_active,
                (select count(*) from ${users} where ${users.isAdmin})::int as users_admins,
                (select count(distinct ${sessions.userId}) from ${sessions}
                    where ${sessions.expiresAt} > now())::int as signed_in,
                (select count(*) from ${projects})::int as projects,
                (select count(*) from ${diagrams})::int as diagrams,
                -- published = has at least one snapshot; EXISTS stops at the first
                -- one instead of reading every snapshot of every diagram
                (select count(*) from ${diagrams}
                    where exists (select 1 from ${snapshots}
                        where ${snapshots.diagramId} = ${diagrams.id}))::int as published,
                (select count(*) from ${shareLinks} where ${activeLinkSql()})::int as links,
                -- a lease nobody renewed is not someone editing
                (select count(*) from ${diagramLocks}
                    where ${diagramLocks.expiresAt} > now())::int as editing,
                (select count(*) from ${auditLog}
                    where ${auditLog.action} = 'drift.check'
                    and ${auditLog.at} >= ${new Date(Date.now() - DAY_MS)})::int as checks
        `),
        activityByDay(db, timeZone).catch(() =>
            // a zone this database does not know: show UTC days instead
            activityByDay(db, 'UTC')
        ),
    ]);
    const c = counts.rows[0];

    return {
        users: {
            total: c.users_total,
            active: c.users_active,
            admins: c.users_admins,
            signedIn: c.signed_in,
        },
        projects: c.projects,
        diagrams: { total: c.diagrams, published: c.published },
        activeLinks: c.links,
        editingNow: c.editing,
        driftChecks24h: c.checks,
        activity,
    };
}

/**
 * Events per day for the last ACTIVITY_DAYS days in `timeZone`, with a row for
 * every day, empty ones included. The window starts at the beginning of the
 * day six days ago in that zone, so it holds seven whole days.
 */
async function activityByDay(db: Db, timeZone: string) {
    const actions = sql.join(
        EVENT_ACTIONS.map((a) => sql`${a}`),
        sql`, `
    );
    const result = await db.execute<{ day: string; events: number }>(sql`
        with local as (
            select (now() at time zone ${timeZone})::date as today
        ),
        win as (
            select today,
                   (today - ${ACTIVITY_DAYS - 1}::int)::timestamp at time zone ${timeZone} as start_at
            from local
        ),
        counted as (
            select (a.at at time zone ${timeZone})::date as day, count(*)::int as n
            from audit_log a, win
            where a.action in (${actions}) and a.at >= win.start_at
            group by 1
        )
        select to_char(d::date, 'YYYY-MM-DD') as day, coalesce(c.n, 0)::int as events
        from win
        -- timestamp, not date: with dates Postgres would pick the timestamptz
        -- version, and the day boundaries would follow the session's time zone
        cross join generate_series(
            (win.today - ${ACTIVITY_DAYS - 1}::int)::timestamp,
            win.today::timestamp,
            interval '1 day'
        ) d
        left join counted c on c.day = d::date
        order by d
    `);
    return { timeZone, days: result.rows };
}
