import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AdminUser } from '@/lib/qubdi/api';
import { UsersPanel } from '../users-panel';

const hoursAgo = (h: number) =>
    new Date(Date.now() - h * 3_600_000).toISOString();

const row = (
    over: Partial<AdminUser> & Pick<AdminUser, 'id' | 'email'>
): AdminUser => ({
    isAdmin: false,
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    lastLoginAt: null,
    lastActiveAt: null,
    projects: 0,
    ...over,
});

const users = [
    row({
        id: 'me',
        email: 'me@corp.io',
        isAdmin: true,
        lastLoginAt: hoursAgo(1),
        lastActiveAt: hoursAgo(0),
    }),
    row({
        id: 'u2',
        email: 'ann@corp.io',
        lastLoginAt: hoursAgo(3),
        lastActiveAt: hoursAgo(0.05),
    }),
    row({ id: 'u3', email: 'bob@corp.io', lastLoginAt: hoursAgo(48) }),
    row({ id: 'u4', email: 'cara@corp.io' }),
    row({
        id: 'u5',
        email: 'old@corp.io',
        isActive: false,
        lastLoginAt: hoursAgo(24 * 40),
    }),
];

const adminListUsers = vi.fn();
const adminBulkUsers = vi.fn();
const adminListUserSessions = vi.fn();
const adminSignOutUser = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        adminListUsers: (...a: unknown[]) => adminListUsers(...a),
        adminBulkUsers: (...a: unknown[]) => adminBulkUsers(...a),
        adminListUserSessions: (...a: unknown[]) => adminListUserSessions(...a),
        adminSignOutUser: (...a: unknown[]) => adminSignOutUser(...a),
        adminUpdateUser: vi.fn(),
        adminCreateUser: vi.fn(),
        adminDeleteUser: vi.fn(),
    },
}));

const toast = vi.fn();
vi.mock('@/platform/toast/use-toast', () => ({
    useToast: () => ({ toast }),
}));

const rowFor = (email: string) =>
    screen.getByText(email).closest('tr') as HTMLElement;
const tick = (email: string) =>
    fireEvent.click(screen.getByRole('checkbox', { name: `Select ${email}` }));
const toolbar = () =>
    screen.queryByRole('toolbar', { name: 'Actions for the selected users' });
const box = (name: string) =>
    screen.getByRole('checkbox', { name }) as HTMLInputElement;
const selectAll = () => box('Select all users on this page');

const render_ = async () => {
    render(<UsersPanel currentUserId="me" />);
    await screen.findByText('ann@corp.io');
};

describe('UsersPanel: sign-ins, selection and bulk actions', () => {
    beforeEach(() => {
        adminListUsers.mockReset();
        adminBulkUsers.mockReset();
        adminListUserSessions.mockReset();
        adminSignOutUser.mockReset();
        toast.mockReset();
        adminListUsers.mockImplementation(async (p: { status?: string }) => ({
            items: users.filter(
                (u) => !p.status || (p.status === 'active') === u.isActive
            ),
            total: users.length,
            page: 1,
            limit: 10,
        }));
        adminBulkUsers.mockResolvedValue({ changed: 2, unchanged: 0 });
        adminListUserSessions.mockResolvedValue([]);
        adminSignOutUser.mockResolvedValue({ signedOut: 1 });
    });

    describe('the last sign-in column', () => {
        it('says how long ago, with the exact time on hover', async () => {
            await render_();
            const cell = within(rowFor('ann@corp.io')).getByText('3 hours ago');
            expect(cell.tagName).toBe('TIME');
            expect(cell.getAttribute('title')).toMatch(/\d{4}/);
            expect(
                within(rowFor('bob@corp.io')).getByText('2 days ago')
            ).toBeTruthy();
            expect(
                within(rowFor('old@corp.io')).getByText('1 month ago')
            ).toBeTruthy();
        });

        it('says "Never" for someone who has not signed in', async () => {
            await render_();
            expect(
                within(rowFor('cara@corp.io')).getByText('Never')
            ).toBeTruthy();
        });

        it('marks only those who are signed in now', async () => {
            await render_();
            expect(
                within(rowFor('ann@corp.io')).getByText('Signed in')
            ).toBeTruthy();
            expect(
                within(rowFor('me@corp.io')).getByText('Signed in')
            ).toBeTruthy();
            expect(
                within(rowFor('bob@corp.io')).queryByText('Signed in')
            ).toBeNull();
            expect(
                within(rowFor('cara@corp.io')).queryByText('Signed in')
            ).toBeNull();
        });
    });

    describe('choosing people', () => {
        it('shows no bulk actions until someone is ticked', async () => {
            await render_();
            expect(toolbar()).toBeNull();
        });

        it('counts the people ticked, and hides the actions again when none is left', async () => {
            await render_();
            tick('ann@corp.io');
            expect(within(toolbar()!).getByText('1 selected')).toBeTruthy();
            tick('bob@corp.io');
            expect(within(toolbar()!).getByText('2 selected')).toBeTruthy();
            tick('ann@corp.io');
            tick('bob@corp.io');
            expect(toolbar()).toBeNull();
        });

        it('does not let the caller tick themselves', async () => {
            await render_();
            const mine = box('Select me@corp.io');
            expect(mine.disabled).toBe(true);
            expect(mine.getAttribute('title')).toBe(
                'You cannot select yourself'
            );
        });

        it('selects everyone on the page but the caller, and clears them again', async () => {
            await render_();
            fireEvent.click(selectAll());
            expect(within(toolbar()!).getByText('4 selected')).toBeTruthy();
            expect(box('Select ann@corp.io').checked).toBe(true);
            expect(box('Select me@corp.io').checked).toBe(false);
            expect(selectAll().checked).toBe(true);

            fireEvent.click(selectAll());
            expect(toolbar()).toBeNull();
            expect(box('Select ann@corp.io').checked).toBe(false);
        });

        it('shows "some" when only part of the page is ticked', async () => {
            await render_();
            tick('ann@corp.io');
            expect(selectAll().checked).toBe(false);
            expect(selectAll().indeterminate).toBe(true);
            fireEvent.click(selectAll());
            expect(selectAll().indeterminate).toBe(false);
            expect(selectAll().checked).toBe(true);
        });

        it('lets go of everyone with Clear selection', async () => {
            await render_();
            tick('ann@corp.io');
            tick('bob@corp.io');
            fireEvent.click(
                screen.getByRole('button', { name: 'Clear selection' })
            );
            expect(toolbar()).toBeNull();
            expect(box('Select ann@corp.io').checked).toBe(false);
        });

        it('starts with nothing ticked when the list is filtered', async () => {
            await render_();
            tick('ann@corp.io');
            fireEvent.click(screen.getByRole('button', { name: 'Active' }));
            await waitFor(() =>
                expect(screen.queryByText('old@corp.io')).toBeNull()
            );
            expect(toolbar()).toBeNull();
            expect(box('Select ann@corp.io').checked).toBe(false);
        });

        it('starts with nothing ticked when a search changes the rows', async () => {
            await render_();
            tick('ann@corp.io');
            fireEvent.change(
                screen.getByRole('searchbox', { name: 'Search users' }),
                {
                    target: { value: 'bob' },
                }
            );
            await waitFor(() => expect(toolbar()).toBeNull());
        });
    });

    describe('enabling', () => {
        it('goes straight through, for exactly the people ticked', async () => {
            await render_();
            tick('ann@corp.io');
            tick('old@corp.io');
            fireEvent.click(
                screen.getByRole('button', { name: 'Enable selected users' })
            );

            await waitFor(() =>
                expect(adminBulkUsers).toHaveBeenCalledWith('enable', [
                    'u2',
                    'u5',
                ])
            );
        });
    });

    describe.each([
        [
            'disable',
            'Disable selected users',
            'Disable 2 users?',
            'Disable 2 users',
            /signed out at once/,
        ],
        [
            'delete',
            'Delete selected users',
            'Delete 2 users?',
            'Delete 2 users',
            /cannot be brought back/,
        ],
    ] as const)('%s', (action, openName, title, confirmName, warning) => {
        it('asks first, and says what will happen', async () => {
            await render_();
            tick('ann@corp.io');
            tick('bob@corp.io');

            fireEvent.click(screen.getByRole('button', { name: openName }));

            const dialog = await screen.findByRole('alertdialog');
            expect(within(dialog).getByText(title)).toBeTruthy();
            expect(within(dialog).getByText(warning)).toBeTruthy();
            expect(adminBulkUsers).not.toHaveBeenCalled();
        });

        it('sends nothing when it is cancelled, and keeps the people ticked', async () => {
            await render_();
            tick('ann@corp.io');
            tick('bob@corp.io');
            fireEvent.click(screen.getByRole('button', { name: openName }));
            const dialog = await screen.findByRole('alertdialog');

            fireEvent.click(
                within(dialog).getByRole('button', { name: 'Cancel' })
            );

            await waitFor(() =>
                expect(screen.queryByRole('alertdialog')).toBeNull()
            );
            expect(adminBulkUsers).not.toHaveBeenCalled();
            expect(within(toolbar()!).getByText('2 selected')).toBeTruthy();
        });

        it('does it for exactly the people ticked, then clears, reloads and says so', async () => {
            adminBulkUsers.mockResolvedValue({ changed: 2, unchanged: 0 });
            await render_();
            tick('ann@corp.io');
            tick('bob@corp.io');
            const callsBefore = adminListUsers.mock.calls.length;
            fireEvent.click(screen.getByRole('button', { name: openName }));
            const dialog = await screen.findByRole('alertdialog');

            fireEvent.click(
                within(dialog).getByRole('button', { name: confirmName })
            );

            await waitFor(() =>
                expect(adminBulkUsers).toHaveBeenCalledWith(action, [
                    'u2',
                    'u3',
                ])
            );
            await waitFor(() => expect(toolbar()).toBeNull());
            await waitFor(() =>
                expect(adminListUsers.mock.calls.length).toBeGreaterThan(
                    callsBefore
                )
            );
            expect(toast).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: `${action === 'delete' ? 'Deleted' : 'Disabled'} 2 users`,
                })
            );
        });
    });

    describe('what it tells the admin afterwards', () => {
        const enableTwo = async () => {
            await render_();
            tick('ann@corp.io');
            tick('old@corp.io');
            fireEvent.click(
                screen.getByRole('button', { name: 'Enable selected users' })
            );
        };

        it('says how many it left as they were', async () => {
            adminBulkUsers.mockResolvedValue({ changed: 1, unchanged: 1 });
            await enableTwo();
            await waitFor(() =>
                expect(toast).toHaveBeenCalledWith({
                    title: 'Enabled 1 user',
                    description: '1 account left as they were.',
                })
            );
        });

        it('says so when nothing needed doing', async () => {
            adminBulkUsers.mockResolvedValue({ changed: 0, unchanged: 2 });
            await enableTwo();
            await waitFor(() =>
                expect(toast).toHaveBeenCalledWith({
                    title: 'Nothing to change',
                    description:
                        'They were already in that state, or no longer exist.',
                })
            );
        });

        it('shows the reason when the server refuses, and keeps the people ticked', async () => {
            adminBulkUsers.mockRejectedValue(new ApiError(400, 'last_admin'));
            await enableTwo();
            expect((await screen.findByRole('alert')).textContent).toBe(
                'There must be at least one admin who can sign in.'
            );
            expect(within(toolbar()!).getByText('2 selected')).toBeTruthy();
            expect(toast).not.toHaveBeenCalled();
        });
    });

    describe('sessions', () => {
        it('opens the sessions of the person in that row', async () => {
            adminListUserSessions.mockResolvedValue([
                {
                    createdAt: hoursAgo(2),
                    lastSeenAt: hoursAgo(0.1),
                    expiresAt: hoursAgo(-100),
                    userAgent:
                        'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
                },
            ]);
            await render_();

            fireEvent.click(
                within(rowFor('ann@corp.io')).getByRole('button', {
                    name: 'Sessions of ann@corp.io',
                })
            );

            expect(await screen.findByText('Firefox on Linux')).toBeTruthy();
            expect(adminListUserSessions).toHaveBeenCalledWith('u2');
        });

        it('refreshes the list once the person is signed out', async () => {
            adminListUserSessions.mockResolvedValue([
                {
                    createdAt: hoursAgo(2),
                    lastSeenAt: hoursAgo(0.1),
                    expiresAt: hoursAgo(-100),
                    userAgent: null,
                },
            ]);
            await render_();
            const callsBefore = adminListUsers.mock.calls.length;
            fireEvent.click(
                within(rowFor('ann@corp.io')).getByRole('button', {
                    name: 'Sessions of ann@corp.io',
                })
            );
            await screen.findByText('Unknown browser');

            fireEvent.click(
                screen.getByRole('button', { name: 'Sign out everywhere' })
            );

            await waitFor(() =>
                expect(adminSignOutUser).toHaveBeenCalledWith('u2')
            );
            await waitFor(() =>
                expect(adminListUsers.mock.calls.length).toBeGreaterThan(
                    callsBefore
                )
            );
        });

        it("does not offer the caller's own sessions: that is the ordinary Sign out", async () => {
            await render_();
            const button = within(rowFor('me@corp.io')).getByRole('button', {
                name: 'Sessions of me@corp.io',
            }) as HTMLButtonElement;
            expect(button.disabled).toBe(true);
            expect(button.getAttribute('title')).toBe(
                'Use Sign out in the account menu'
            );
        });
    });

    describe('the other row actions, as icons', () => {
        it('name the person in each row, so a screen reader can tell them apart', async () => {
            await render_();
            const names = ['ann@corp.io', 'bob@corp.io'].flatMap((email) => {
                const row = within(rowFor(email));
                return [
                    row.getByRole('button', {
                        name: `Reset password of ${email}`,
                    }),
                    row.getByRole('button', { name: `Sessions of ${email}` }),
                    row.getByRole('button', { name: `Delete ${email}` }),
                ].map((b) => b.getAttribute('aria-label'));
            });
            expect(new Set(names).size).toBe(6);
        });

        it('open the reset-password dialog for that person', async () => {
            await render_();
            fireEvent.click(
                within(rowFor('ann@corp.io')).getByRole('button', {
                    name: 'Reset password of ann@corp.io',
                })
            );
            const dialog = await screen.findByRole('dialog');
            expect(
                within(dialog).getByText(/Set a new password for ann@corp.io/)
            ).toBeTruthy();
        });

        it('ask before deleting that person', async () => {
            await render_();
            fireEvent.click(
                within(rowFor('ann@corp.io')).getByRole('button', {
                    name: 'Delete ann@corp.io',
                })
            );
            const dialog = await screen.findByRole('alertdialog');
            expect(
                within(dialog).getByText(
                    /ann@corp.io will lose access immediately/
                )
            ).toBeTruthy();
        });

        it('do not let the caller delete themselves, and say why', async () => {
            await render_();
            const button = within(rowFor('me@corp.io')).getByRole('button', {
                name: 'Delete me@corp.io',
            }) as HTMLButtonElement;
            expect(button.disabled).toBe(true);
            expect(button.getAttribute('title')).toBe(
                'You cannot delete yourself'
            );
        });

        it('show what each one is on hover', async () => {
            await render_();
            const row = within(rowFor('ann@corp.io'));
            expect(
                row
                    .getByRole('button', { name: /^Reset password of/ })
                    .getAttribute('title')
            ).toBe('Reset password');
            expect(
                row
                    .getByRole('button', { name: /^Sessions of/ })
                    .getAttribute('title')
            ).toBe('Sessions');
            expect(
                row
                    .getByRole('button', { name: /^Delete / })
                    .getAttribute('title')
            ).toBe('Delete user');
        });
    });

    it('still shows all seven columns for an empty list', async () => {
        adminListUsers.mockImplementation(async () => ({
            items: [],
            total: 0,
            page: 1,
            limit: 10,
        }));
        render(<UsersPanel currentUserId="me" />);
        const cell = await screen.findByText('No users yet.');
        expect(cell.getAttribute('colspan')).toBe('7');
        expect(selectAll().disabled).toBe(true);
    });
});
