import { describe, expect, it } from 'vitest';
import {
    ACTIVITY_GROUP_OPTIONS,
    dayKey,
    dayLabel,
    describeActivity,
    endOfDay,
    groupByDay,
    startOfDay,
} from '../activity';
import type { ActivityItem } from '../api';

const item = (over: Partial<ActivityItem> = {}): ActivityItem => ({
    id: 1,
    at: '2026-10-16T09:30:00.000Z',
    action: 'diagram.publish',
    userId: 'u1',
    userEmail: 'anna@corp.io',
    diagramId: 'd1',
    diagramTitle: 'Orders',
    projectId: null,
    projectName: null,
    targetUserId: null,
    targetUserEmail: null,
    meta: null,
    ...over,
});

const sentence = (over: Partial<ActivityItem>) =>
    describeActivity(item(over))
        .map((s) => s.text)
        .join('');

describe('describeActivity', () => {
    it('reads like a sentence: who, what, to what', () => {
        expect(
            sentence({ action: 'diagram.publish', meta: { version: 3 } })
        ).toBe('anna@corp.io published Orders v3');
    });

    it('marks the person and the diagram so the list can narrow to them', () => {
        const [who, , diagram] = describeActivity(
            item({ action: 'diagram.update' })
        );
        expect(who).toMatchObject({ kind: 'name', userId: 'u1' });
        expect(diagram).toMatchObject({
            text: 'Orders',
            kind: 'name',
            diagramId: 'd1',
        });
    });

    it('does not offer to narrow to the person an admin acted on', () => {
        const segments = describeActivity(
            item({
                action: 'user.disable',
                targetUserId: 'u2',
                targetUserEmail: 'bob@corp.io',
            })
        );
        const target = segments.find((s) => s.text === 'bob@corp.io');
        expect(target?.kind).toBe('name');
        expect(target?.userId).toBeUndefined();
    });

    it('says what is gone instead of leaving a hole', () => {
        const segments = describeActivity(
            item({
                userEmail: null,
                diagramTitle: null,
                action: 'diagram.publish',
            })
        );
        expect(segments.map((s) => s.text).join('')).toBe(
            'A deleted user published a deleted diagram'
        );
        expect(segments[0]).toEqual({ text: 'A deleted user', kind: 'gone' });
        expect(segments[2]).toEqual({
            text: 'a deleted diagram',
            kind: 'gone',
        });
    });

    it('does not offer to narrow to a diagram that no longer exists', () => {
        const [, , diagram] = describeActivity(
            item({ diagramTitle: null, diagramId: 'd1' })
        );
        expect(diagram.diagramId).toBeUndefined();
    });

    it('leaves out the version when the row has none', () => {
        expect(sentence({ action: 'diagram.publish', meta: null })).toBe(
            'anna@corp.io published Orders'
        );
        expect(
            sentence({ action: 'diagram.publish', meta: { version: 0 } })
        ).toBe('anna@corp.io published Orders v0');
    });

    describe('users', () => {
        const target = { targetUserId: 'u2', targetUserEmail: 'bob@corp.io' };

        it.each([
            ['user.create', 'anna@corp.io created the account of bob@corp.io'],
            ['user.delete', 'anna@corp.io deleted the account of bob@corp.io'],
            [
                'user.disable',
                'anna@corp.io disabled the account of bob@corp.io',
            ],
            ['user.enable', 'anna@corp.io enabled the account of bob@corp.io'],
            ['user.sign_out', 'anna@corp.io signed bob@corp.io out everywhere'],
            ['user.update', 'anna@corp.io updated the account of bob@corp.io'],
        ])('%s', (action, expected) => {
            expect(sentence({ action, ...target })).toBe(expected);
        });

        it.each([
            ['user.sign_in', 'anna@corp.io signed in'],
            ['user.logout', 'anna@corp.io signed out'],
            [
                'user.sign_in_failed',
                'anna@corp.io had a failed sign-in or password check',
            ],
            [
                'user.password_check_failed',
                'anna@corp.io typed a wrong current password',
            ],
            ['user.password_change', 'anna@corp.io changed their password'],
            ['mfa.enable', 'anna@corp.io turned on two-factor sign-in'],
            ['mfa.disable', 'anna@corp.io turned off two-factor sign-in'],
            ['mfa.recovery_used', 'anna@corp.io used a recovery code'],
            ['mfa.recovery_renew', 'anna@corp.io made new recovery codes'],
            ['mfa.failed', 'anna@corp.io entered a wrong two-factor code'],
        ])('%s', (action, expected) => {
            expect(sentence({ action })).toBe(expected);
        });

        it('mfa.reset by an admin names the person', () => {
            expect(sentence({ action: 'mfa.reset', ...target })).toBe(
                'anna@corp.io reset the two-factor sign-in of bob@corp.io'
            );
        });

        it('mfa.reset from the command line names no admin', () => {
            expect(
                sentence({
                    action: 'mfa.reset',
                    userId: 'u1',
                    targetUserId: 'u1',
                    targetUserEmail: 'anna@corp.io',
                })
            ).toBe(
                'anna@corp.io had two-factor sign-in reset from the command line'
            );
        });

        it('names a saved connection and its project', () => {
            expect(
                sentence({
                    action: 'connection.create',
                    projectName: 'Shop',
                    meta: { name: 'Prod replica' },
                })
            ).toBe('anna@corp.io saved the connection Prod replica in Shop');
            expect(
                sentence({
                    action: 'connection.delete',
                    projectName: null,
                    meta: null,
                })
            ).toBe('anna@corp.io deleted the connection a connection');
        });

        it('says what an update changed', () => {
            expect(
                sentence({
                    action: 'user.update',
                    ...target,
                    meta: { changed: ['password'] },
                })
            ).toBe('anna@corp.io changed the password of bob@corp.io');
            expect(
                sentence({
                    action: 'user.update',
                    ...target,
                    meta: { changed: ['password', 'isAdmin', 'isActive'] },
                })
            ).toBe(
                'anna@corp.io changed the password, admin access and status of bob@corp.io'
            );
        });

        it('names a deleted person', () => {
            expect(
                sentence({
                    action: 'user.delete',
                    targetUserId: 'u2',
                    targetUserEmail: null,
                })
            ).toBe('anna@corp.io deleted the account of a deleted user');
        });

        it('says the first sign-up created the first admin', () => {
            expect(sentence({ action: 'user.register', diagramId: null })).toBe(
                'anna@corp.io signed up as the first admin'
            );
        });
    });

    describe('projects', () => {
        const base = {
            diagramId: null,
            diagramTitle: null,
            projectId: 'p1',
            projectName: 'Billing',
        };

        it.each([
            ['project.create', 'anna@corp.io created the project Billing'],
            ['project.update', 'anna@corp.io changed the project Billing'],
            ['project.delete', 'anna@corp.io deleted the project Billing'],
        ])('%s', (action, expected) => {
            expect(sentence({ action, ...base })).toBe(expected);
        });

        it('says who got which access to which project', () => {
            expect(
                sentence({
                    action: 'project.member_set',
                    ...base,
                    targetUserId: 'u2',
                    targetUserEmail: 'bob@corp.io',
                    meta: { role: 'editor' },
                })
            ).toBe('anna@corp.io gave bob@corp.io editor access to Billing');
            expect(
                sentence({
                    action: 'project.member_remove',
                    ...base,
                    targetUserId: 'u2',
                    targetUserEmail: 'bob@corp.io',
                })
            ).toBe('anna@corp.io removed bob@corp.io from Billing');
        });

        it('still reads when an old row has no role', () => {
            expect(
                sentence({
                    action: 'project.member_set',
                    ...base,
                    targetUserId: 'u2',
                    targetUserEmail: 'bob@corp.io',
                })
            ).toBe('anna@corp.io changed the access of bob@corp.io to Billing');
        });

        it('says where a diagram was created or deleted when the project is known', () => {
            expect(
                sentence({ action: 'diagram.create', projectName: 'Billing' })
            ).toBe('anna@corp.io created the diagram Orders in Billing');
            expect(sentence({ action: 'diagram.delete' })).toBe(
                'anna@corp.io deleted the diagram Orders'
            );
        });
    });

    describe('share links', () => {
        it('says who can open a new or changed link', () => {
            expect(
                sentence({
                    action: 'share.create',
                    meta: { access: 'anyone' },
                })
            ).toBe(
                'anna@corp.io created a share link for Orders (anyone with the link)'
            );
            expect(
                sentence({
                    action: 'share.update',
                    meta: { access: 'signed_in' },
                })
            ).toBe(
                'anna@corp.io changed a share link of Orders to signed-in users only'
            );
            expect(
                sentence({ action: 'share.update', meta: { access: 'off' } })
            ).toBe('anna@corp.io changed a share link of Orders to off');
        });

        it('revokes and regenerates', () => {
            // rows from before the link was described name no link
            expect(sentence({ action: 'share.revoke' })).toBe(
                'anna@corp.io revoked a share link of Orders'
            );
            expect(
                sentence({
                    action: 'share.revoke',
                    meta: {
                        access: 'signed_in',
                        madeAt: new Date(
                            Date.now() - 2 * 86_400_000
                        ).toISOString(),
                    },
                })
            ).toBe(
                'anna@corp.io revoked a share link of Orders (signed-in users only, made 2 days ago)'
            );
            expect(
                sentence({ action: 'share.revoke', meta: { access: 'off' } })
            ).toBe('anna@corp.io revoked a share link of Orders (off)');
            expect(sentence({ action: 'share.regenerate' })).toBe(
                'anna@corp.io made a new address for a share link of Orders'
            );
        });
    });

    describe('everything else a diagram can do', () => {
        it.each([
            ['diagram.update', 'anna@corp.io saved Orders'],
            ['comment.create', 'anna@corp.io added a comment on Orders'],
            ['comment.update', 'anna@corp.io edited a comment on Orders'],
            ['comment.resolve', 'anna@corp.io resolved a comment on Orders'],
            ['comment.delete', 'anna@corp.io deleted a comment on Orders'],
            [
                'drift.configure',
                'anna@corp.io changed the database drift settings of Orders',
            ],
            [
                'drift.check',
                'anna@corp.io checked the database drift of Orders',
            ],
            [
                'drift.dismiss',
                'anna@corp.io dismissed the database drift of Orders',
            ],
            [
                'lint.configure',
                'anna@corp.io changed the lint settings of Orders',
            ],
        ])('%s', (action, expected) => {
            expect(sentence({ action })).toBe(expected);
        });

        it('introspect.run names the host it read', () => {
            expect(
                sentence({
                    action: 'introspect.run',
                    meta: { dialect: 'postgresql', host: 'db.corp.io' },
                })
            ).toBe('anna@corp.io read the database at db.corp.io');
            expect(sentence({ action: 'introspect.run' })).toBe(
                'anna@corp.io read a database'
            );
        });

        it('audit.export says how many rows the file held', () => {
            expect(
                sentence({ action: 'audit.export', meta: { rows: 120 } })
            ).toBe('anna@corp.io exported the activity log (120 rows)');
            expect(
                sentence({ action: 'audit.export', meta: { rows: 1 } })
            ).toBe('anna@corp.io exported the activity log (1 row)');
            expect(sentence({ action: 'audit.export' })).toBe(
                'anna@corp.io exported the activity log'
            );
        });
    });

    it('shows an action it has no wording for rather than hiding the row', () => {
        expect(sentence({ action: 'billing.refund' })).toBe(
            'anna@corp.io did billing.refund'
        );
    });
});

describe('the filter options', () => {
    it('start with everything, then one option per group the server knows', () => {
        expect(ACTIVITY_GROUP_OPTIONS.map((o) => o.value)).toEqual([
            '',
            'users',
            'projects',
            'diagrams',
            'sharing',
            'checks',
            'exports',
        ]);
    });
});

describe('days', () => {
    // built from local parts so the tests hold in any time zone
    const at = (y: number, m: number, d: number, h = 12, min = 0) =>
        new Date(y, m - 1, d, h, min);
    const now = at(2026, 10, 16, 15);

    it('keys a day by its local date', () => {
        expect(dayKey(at(2026, 1, 5, 0, 0))).toBe('2026-01-05');
        expect(dayKey(at(2026, 12, 31, 23, 59))).toBe('2026-12-31');
    });

    it('calls today and yesterday by name, and older days by their date', () => {
        expect(dayLabel(at(2026, 10, 16, 1), now)).toBe('Today');
        expect(dayLabel(at(2026, 10, 15, 23), now)).toBe('Yesterday');
        const older = dayLabel(at(2026, 10, 12), now);
        expect(older).toMatch(/12/);
        expect(older).not.toMatch(/2026/);
    });

    it('says the year only when it is not this one', () => {
        expect(dayLabel(at(2025, 3, 2), now)).toMatch(/2025/);
    });

    it('knows yesterday across a month boundary', () => {
        expect(dayLabel(at(2026, 9, 30), at(2026, 10, 1))).toBe('Yesterday');
    });

    it('cuts newest-first rows into days without reordering them', () => {
        const rows = [
            item({ id: 5, at: at(2026, 10, 16, 14).toISOString() }),
            item({ id: 4, at: at(2026, 10, 16, 9).toISOString() }),
            item({ id: 3, at: at(2026, 10, 15, 22).toISOString() }),
            item({ id: 2, at: at(2026, 10, 12, 8).toISOString() }),
        ];
        const days = groupByDay(rows, now);
        expect(days.map((d) => d.label)).toEqual([
            'Today',
            'Yesterday',
            expect.stringMatching(/12/),
        ]);
        expect(days.map((d) => d.items.map((i) => i.id))).toEqual([
            [5, 4],
            [3],
            [2],
        ]);
        expect(groupByDay([], now)).toEqual([]);
    });

    it('turns a date field into the first and last instant of that local day', () => {
        const start = new Date(startOfDay('2026-10-16')!);
        const end = new Date(endOfDay('2026-10-16')!);
        expect([
            start.getFullYear(),
            start.getMonth(),
            start.getDate(),
        ]).toEqual([2026, 9, 16]);
        expect([
            start.getHours(),
            start.getMinutes(),
            start.getSeconds(),
        ]).toEqual([0, 0, 0]);
        expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([
            23, 59, 59,
        ]);
        expect(end.getDate()).toBe(16);
    });

    it('ignores an empty or malformed date field', () => {
        for (const bad of [
            '',
            '2026-10',
            '16/10/2026',
            'today',
            '2026-13-45',
        ]) {
            expect(startOfDay(bad), bad).toBeUndefined();
            expect(endOfDay(bad), bad).toBeUndefined();
        }
    });
});
