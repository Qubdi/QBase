// The Activity page's wording and dates. Plain functions, no React.

import type { ActivityGroup, ActivityItem } from './api';

export const ACTIVITY_GROUP_OPTIONS: {
    value: '' | ActivityGroup;
    label: string;
}[] = [
    { value: '', label: 'All activity' },
    { value: 'users', label: 'Users' },
    { value: 'projects', label: 'Projects and access' },
    { value: 'diagrams', label: 'Diagrams' },
    { value: 'sharing', label: 'Share links' },
    { value: 'checks', label: 'Database drift and lint' },
    { value: 'comments', label: 'Comments' },
];

/**
 * A piece of a sentence. `name` is something the line is about (shown
 * emphasised), `gone` is something that no longer exists (shown muted).
 * `userId` and `diagramId` mark the pieces that can narrow the list.
 */
export interface Segment {
    text: string;
    kind: 'text' | 'name' | 'gone';
    /** set on the person who did it: choosing it shows only their activity */
    userId?: string;
    /** set on a diagram that still exists: choosing it shows only its activity */
    diagramId?: string;
}

const text = (value: string): Segment => ({ text: value, kind: 'text' });

const ACCESS_WORDS: Record<
    NonNullable<NonNullable<ActivityItem['meta']>['access']>,
    string
> = {
    anyone: 'anyone with the link',
    signed_in: 'signed-in users only',
    off: 'off',
};

const CHANGED_WORDS = {
    password: 'password',
    isAdmin: 'admin access',
    isActive: 'status',
} as const;

const joinWords = (words: string[]): string =>
    words.length <= 1
        ? (words[0] ?? '')
        : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;

/** One line of the log as a sentence: "ann@corp.io published Orders v3". */
export function describeActivity(item: ActivityItem): Segment[] {
    const who: Segment = item.userEmail
        ? {
              text: item.userEmail,
              kind: 'name',
              ...(item.userId ? { userId: item.userId } : {}),
          }
        : { text: 'A deleted user', kind: 'gone' };

    const diagram: Segment = item.diagramTitle
        ? {
              text: item.diagramTitle,
              kind: 'name',
              // a deleted diagram has no activity page to narrow down to
              ...(item.diagramId ? { diagramId: item.diagramId } : {}),
          }
        : { text: 'a deleted diagram', kind: 'gone' };

    const project: Segment = item.projectName
        ? { text: item.projectName, kind: 'name' }
        : { text: 'a deleted project', kind: 'gone' };

    const target: Segment = item.targetUserEmail
        ? { text: item.targetUserEmail, kind: 'name' }
        : { text: 'a deleted user', kind: 'gone' };

    const inProject = item.projectName ? [text(' in '), project] : [];
    const meta = item.meta;

    switch (item.action) {
        case 'user.register':
            return [who, text(' signed up as the first admin')];
        case 'user.create':
            return [who, text(' created the account of '), target];
        case 'user.update': {
            const changed = (meta?.changed ?? []).map((c) => CHANGED_WORDS[c]);
            return changed.length > 0
                ? [who, text(` changed the ${joinWords(changed)} of `), target]
                : [who, text(' updated the account of '), target];
        }
        case 'user.delete':
            return [who, text(' deleted the account of '), target];
        case 'user.disable':
            return [who, text(' disabled the account of '), target];
        case 'user.enable':
            return [who, text(' enabled the account of '), target];
        case 'user.sign_out':
            return [who, text(' signed '), target, text(' out everywhere')];
        case 'user.sign_in':
            return [who, text(' signed in')];
        case 'user.sign_in_failed':
            return [who, text(' had a failed sign-in or password check')];
        case 'user.password_change':
            return [who, text(' changed their password')];

        case 'project.create':
            return [who, text(' created the project '), project];
        case 'project.update':
            return [who, text(' changed the project '), project];
        case 'project.delete':
            return [who, text(' deleted the project '), project];
        case 'project.member_set':
            return meta?.role
                ? [
                      who,
                      text(' gave '),
                      target,
                      text(` ${meta.role} access to `),
                      project,
                  ]
                : [
                      who,
                      text(' changed the access of '),
                      target,
                      text(' to '),
                      project,
                  ];
        case 'project.member_remove':
            return [who, text(' removed '), target, text(' from '), project];

        case 'diagram.create':
            return [who, text(' created the diagram '), diagram, ...inProject];
        case 'diagram.update':
            return [who, text(' saved '), diagram];
        case 'diagram.delete':
            return [who, text(' deleted the diagram '), diagram, ...inProject];
        case 'diagram.publish':
            return [
                who,
                text(' published '),
                diagram,
                ...(meta?.version !== undefined
                    ? [text(` v${meta.version}`)]
                    : []),
            ];

        case 'share.create':
            return [
                who,
                text(' created a share link for '),
                diagram,
                ...(meta?.access
                    ? [text(` (${ACCESS_WORDS[meta.access]})`)]
                    : []),
            ];
        case 'share.update':
            return [
                who,
                text(' changed a share link of '),
                diagram,
                ...(meta?.access
                    ? [text(` to ${ACCESS_WORDS[meta.access]}`)]
                    : []),
            ];
        case 'share.revoke':
            return [who, text(' revoked a share link of '), diagram];
        case 'share.regenerate':
            return [
                who,
                text(' made a new address for a share link of '),
                diagram,
            ];

        case 'connection.create':
        case 'connection.update':
        case 'connection.delete': {
            const verb = {
                'connection.create': ' saved the connection ',
                'connection.update': ' changed the connection ',
                'connection.delete': ' deleted the connection ',
            }[item.action];
            return [
                who,
                text(verb),
                meta?.name
                    ? { text: meta.name, kind: 'name' as const }
                    : { text: 'a connection', kind: 'gone' as const },
                ...inProject,
            ];
        }

        case 'comment.create':
            return [who, text(' added a comment on '), diagram];
        case 'comment.update':
            return [who, text(' edited a comment on '), diagram];
        case 'comment.resolve':
            return [who, text(' resolved a comment on '), diagram];
        case 'comment.delete':
            return [who, text(' deleted a comment on '), diagram];

        case 'drift.configure':
            return [
                who,
                text(' changed the database drift settings of '),
                diagram,
            ];
        case 'drift.check':
            return [who, text(' checked the database drift of '), diagram];
        case 'drift.dismiss':
            return [who, text(' dismissed the database drift of '), diagram];
        case 'lint.configure':
            return [who, text(' changed the lint settings of '), diagram];

        default:
            // an action a newer server added: say it rather than hide it
            return [who, text(` did ${item.action}`)];
    }
}

// ---- days ----

const pad = (n: number) => String(n).padStart(2, '0');

/** The day an instant falls on in the viewer's time zone, `2026-10-16`. */
export const dayKey = (date: Date): string =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** "Today", "Yesterday", or the date; the year only when it is not this year. */
export function dayLabel(date: Date, now: Date = new Date()): string {
    const key = dayKey(date);
    if (key === dayKey(now)) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (key === dayKey(yesterday)) return 'Yesterday';
    return date.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(date.getFullYear() === now.getFullYear()
            ? {}
            : { year: 'numeric' as const }),
    });
}

export interface ActivityDay {
    key: string;
    label: string;
    items: ActivityItem[];
}

/** Newest-first rows cut into one block per day, keeping their order. */
export function groupByDay(
    items: ActivityItem[],
    now: Date = new Date()
): ActivityDay[] {
    const days: ActivityDay[] = [];
    for (const item of items) {
        const when = new Date(item.at);
        const key = dayKey(when);
        const last = days.at(-1);
        if (last?.key === key) {
            last.items.push(item);
        } else {
            days.push({ key, label: dayLabel(when, now), items: [item] });
        }
    }
    return days;
}

/**
 * A moment on a `YYYY-MM-DD` day in the viewer's time zone, as an ISO time.
 * Undefined for anything that is not a real date: `new Date(2026, 12, 45)`
 * quietly rolls over into the next year, so the result is checked.
 */
function onDay(value: string, ...time: [number, number, number, number]) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return undefined;
    const [year, month, day] = [match[1], match[2], match[3]].map(Number);
    const date = new Date(year, month - 1, day, ...time);
    const real =
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day;
    return real ? date.toISOString() : undefined;
}

/** The first instant of a `YYYY-MM-DD` day in the viewer's time zone. */
export const startOfDay = (value: string) => onDay(value, 0, 0, 0, 0);

/** The last millisecond of a `YYYY-MM-DD` day in the viewer's time zone. */
export const endOfDay = (value: string) => onDay(value, 23, 59, 59, 999);
