// The Activity page's wording and dates. Plain functions, no React.

import type { ActivityGroup, ActivityItem } from './api';
import { i18n } from '@/i18n/i18n';
import { ago } from './when';

/** One piece of wording, from `qubdi.adminProjects.sentence` unless the path says otherwise. */
const s = (key: string, options?: Record<string, unknown>): string =>
    i18n.t(`qubdi.adminProjects.${key}`, options);
const w = (key: string, options?: Record<string, unknown>): string =>
    s(`sentence.${key}`, options);

/** The kinds of activity the filter offers; `labelKey` is under `qubdi.adminProjects.activity`. */
export const ACTIVITY_GROUP_OPTIONS: {
    value: '' | ActivityGroup;
    labelKey: string;
}[] = [
    { value: '', labelKey: 'groupAll' },
    { value: 'users', labelKey: 'groupUsers' },
    { value: 'projects', labelKey: 'groupProjects' },
    { value: 'diagrams', labelKey: 'groupDiagrams' },
    { value: 'sharing', labelKey: 'groupSharing' },
    { value: 'checks', labelKey: 'groupChecks' },
    { value: 'exports', labelKey: 'groupExports' },
];

/** The filter's options with their wording in the current language. */
export const activityGroupOptions = (): {
    value: '' | ActivityGroup;
    label: string;
}[] =>
    ACTIVITY_GROUP_OPTIONS.map((o) => ({
        value: o.value,
        label: s(`activity.${o.labelKey}`),
    }));

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

type Access = NonNullable<NonNullable<ActivityItem['meta']>['access']>;

const ACCESS_KEYS: Record<Access, string> = {
    anyone: 'accessAnyone',
    signed_in: 'accessSignedIn',
    off: 'accessOff',
};

const accessWords = (access: Access): string => w(ACCESS_KEYS[access]);

/** Which link was revoked: " (anyone with the link, made 2 days ago)". Old rows have neither. */
const revokedDetail = (meta: ActivityItem['meta']): Segment[] => {
    const parts = [
        ...(meta?.access ? [accessWords(meta.access)] : []),
        ...(meta?.madeAt ? [w('madeAgo', { ago: ago(meta.madeAt) })] : []),
    ];
    return parts.length > 0
        ? [text(w('details', { details: parts.join(w('listSeparator')) }))]
        : [];
};

const CHANGED_KEYS = {
    password: 'changedPassword',
    isAdmin: 'changedAdmin',
    isActive: 'changedStatus',
} as const;

const joinWords = (words: string[]): string =>
    words.length <= 1
        ? (words[0] ?? '')
        : w('listAnd', {
              list: words.slice(0, -1).join(w('listSeparator')),
              last: words.at(-1),
          });

/** One line of the log as a sentence: "ann@corp.io published Orders v3". */
export function describeActivity(item: ActivityItem): Segment[] {
    const who: Segment = item.userEmail
        ? {
              text: item.userEmail,
              kind: 'name',
              ...(item.userId ? { userId: item.userId } : {}),
          }
        : { text: w('deletedUser'), kind: 'gone' };

    const diagram: Segment = item.diagramTitle
        ? {
              text: item.diagramTitle,
              kind: 'name',
              // a deleted diagram has no activity page to narrow down to
              ...(item.diagramId ? { diagramId: item.diagramId } : {}),
          }
        : { text: w('deletedDiagram'), kind: 'gone' };

    const project: Segment = item.projectName
        ? { text: item.projectName, kind: 'name' }
        : { text: w('deletedProject'), kind: 'gone' };

    const target: Segment = item.targetUserEmail
        ? { text: item.targetUserEmail, kind: 'name' }
        : { text: w('deletedTarget'), kind: 'gone' };

    const inProject = item.projectName ? [text(w('inProject')), project] : [];
    const meta = item.meta;

    switch (item.action) {
        case 'user.register':
            return [who, text(w('userRegister'))];
        case 'user.create':
            return [who, text(w('userCreate')), target];
        case 'user.update': {
            const changed = (meta?.changed ?? []).map((c) =>
                w(CHANGED_KEYS[c])
            );
            return changed.length > 0
                ? [
                      who,
                      text(
                          w('userUpdateChanged', { what: joinWords(changed) })
                      ),
                      target,
                  ]
                : [who, text(w('userUpdate')), target];
        }
        case 'user.delete':
            return [who, text(w('userDelete')), target];
        case 'user.disable':
            return [who, text(w('userDisable')), target];
        case 'user.enable':
            return [who, text(w('userEnable')), target];
        case 'user.sign_out':
            return [
                who,
                text(w('userSignOutBefore')),
                target,
                text(w('userSignOutAfter')),
            ];
        case 'user.sign_in':
            return [who, text(w('userSignIn'))];
        case 'user.logout':
            return [who, text(w('userLogout'))];
        case 'user.sign_in_failed':
            return [who, text(w('userSignInFailed'))];
        case 'user.password_check_failed':
            return [who, text(w('userPasswordCheckFailed'))];
        case 'user.password_change':
            return [who, text(w('userPasswordChange'))];

        case 'mfa.enable':
            return [who, text(w('mfaEnable'))];
        case 'mfa.disable':
            return [who, text(w('mfaDisable'))];
        case 'mfa.reset':
            // the command-line reset has no admin: the row names the account itself
            return item.userId && item.userId === item.targetUserId
                ? [who, text(w('mfaResetCli'))]
                : [who, text(w('mfaReset')), target];
        case 'mfa.recovery_used':
            return [who, text(w('mfaRecoveryUsed'))];
        case 'mfa.recovery_renew':
            return [who, text(w('mfaRecoveryRenew'))];
        case 'mfa.failed':
            return [who, text(w('mfaFailed'))];

        case 'project.create':
            return [who, text(w('projectCreate')), project];
        case 'project.update':
            return [who, text(w('projectUpdate')), project];
        case 'project.delete':
            return [who, text(w('projectDelete')), project];
        case 'project.member_set':
            return meta?.role
                ? [
                      who,
                      text(w('projectMemberGave')),
                      target,
                      text(w('projectMemberAccess', { role: meta.role })),
                      project,
                  ]
                : [
                      who,
                      text(w('projectMemberChanged')),
                      target,
                      text(w('projectMemberTo')),
                      project,
                  ];
        case 'project.member_remove':
            return [
                who,
                text(w('projectMemberRemoveBefore')),
                target,
                text(w('projectMemberRemoveAfter')),
                project,
            ];

        case 'diagram.create':
            return [who, text(w('diagramCreate')), diagram, ...inProject];
        case 'diagram.update':
            return [who, text(w('diagramUpdate')), diagram];
        case 'diagram.delete':
            return [who, text(w('diagramDelete')), diagram, ...inProject];
        case 'diagram.publish':
            return [
                who,
                text(w('diagramPublish')),
                diagram,
                ...(meta?.version !== undefined
                    ? [text(w('diagramVersion', { version: meta.version }))]
                    : []),
            ];

        case 'share.create':
            return [
                who,
                text(w('shareCreate')),
                diagram,
                ...(meta?.access
                    ? [
                          text(
                              w('shareCreateAccess', {
                                  access: accessWords(meta.access),
                              })
                          ),
                      ]
                    : []),
            ];
        case 'share.update':
            return [
                who,
                text(w('shareUpdate')),
                diagram,
                ...(meta?.access
                    ? [
                          text(
                              w('shareUpdateAccess', {
                                  access: accessWords(meta.access),
                              })
                          ),
                      ]
                    : []),
            ];
        case 'share.revoke':
            return [
                who,
                text(w('shareRevoke')),
                diagram,
                ...revokedDetail(meta),
            ];
        case 'share.regenerate':
            return [who, text(w('shareRegenerate')), diagram];

        case 'connection.create':
        case 'connection.update':
        case 'connection.delete': {
            const verb = {
                'connection.create': 'connectionCreate',
                'connection.update': 'connectionUpdate',
                'connection.delete': 'connectionDelete',
            }[item.action];
            return [
                who,
                text(w(verb)),
                meta?.name
                    ? { text: meta.name, kind: 'name' as const }
                    : {
                          text: w('deletedConnection'),
                          kind: 'gone' as const,
                      },
                ...inProject,
            ];
        }

        // rows from before comments were removed still read as they did
        case 'comment.create':
            return [who, text(w('commentCreate')), diagram];
        case 'comment.update':
            return [who, text(w('commentUpdate')), diagram];
        case 'comment.resolve':
            return [who, text(w('commentResolve')), diagram];
        case 'comment.delete':
            return [who, text(w('commentDelete')), diagram];

        case 'drift.configure':
            return [who, text(w('driftConfigure')), diagram];
        case 'drift.check':
            return [who, text(w('driftCheck')), diagram];
        case 'drift.dismiss':
            return [who, text(w('driftDismiss')), diagram];
        case 'lint.configure':
            return [who, text(w('lintConfigure')), diagram];
        case 'introspect.run':
            return [
                who,
                text(
                    meta?.host
                        ? w('introspectHost', { host: meta.host })
                        : w('introspect')
                ),
            ];
        case 'audit.export':
            return [
                who,
                text(
                    meta?.rows === undefined
                        ? w('auditExport')
                        : w('auditExportRows', { count: meta.rows })
                ),
            ];

        default:
            // an action a newer server added: say it rather than hide it
            return [who, text(w('unknownAction', { action: item.action }))];
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
    if (key === dayKey(now)) return s('activity.today');
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (key === dayKey(yesterday)) return s('activity.yesterday');
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
