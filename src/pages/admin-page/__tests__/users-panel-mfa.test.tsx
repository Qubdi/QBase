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
    row({ id: 'me', email: 'me@corp.io', isAdmin: true, mfaEnabled: true }),
    row({ id: 'u2', email: 'ann@corp.io', mfaEnabled: true }),
    row({ id: 'u3', email: 'bob@corp.io', mfaEnabled: false }),
    row({ id: 'u4', email: 'cara@corp.io' }),
    row({ id: 'u5', email: 'root@corp.io', isAdmin: true, mfaEnabled: true }),
];

const adminListUsers = vi.fn();
const adminResetMfa = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        adminListUsers: (...a: unknown[]) => adminListUsers(...a),
        adminResetMfa: (...a: unknown[]) => adminResetMfa(...a),
        adminUpdateUser: vi.fn(),
        adminCreateUser: vi.fn(),
        adminDeleteUser: vi.fn(),
        adminBulkUsers: vi.fn(),
        adminListUserSessions: vi.fn(),
        adminSignOutUser: vi.fn(),
    },
}));

const toast = vi.fn();
vi.mock('@/platform/toast/use-toast', () => ({
    useToast: () => ({ toast }),
}));

const rowFor = (email: string) =>
    screen.getByText(email).closest('tr') as HTMLElement;

describe('UsersPanel: two-factor', () => {
    beforeEach(async () => {
        adminListUsers.mockReset();
        adminResetMfa.mockReset();
        toast.mockReset();
        adminListUsers.mockResolvedValue({
            items: users,
            total: users.length,
            page: 1,
            limit: 10,
        });
        adminResetMfa.mockResolvedValue({ reset: true });
        render(<UsersPanel currentUserId="me" />);
        await screen.findByText('ann@corp.io');
    });

    it('badges the people who have it on, and only them', () => {
        expect(within(rowFor('ann@corp.io')).getByText('2FA')).toBeTruthy();
        expect(within(rowFor('me@corp.io')).getByText('2FA')).toBeTruthy();
        expect(within(rowFor('bob@corp.io')).queryByText('2FA')).toBeNull();
        expect(within(rowFor('cara@corp.io')).queryByText('2FA')).toBeNull();
    });

    it('offers a reset only for someone else who has it on', () => {
        expect(
            screen.getByRole('button', {
                name: 'Reset two-factor of ann@corp.io',
            })
        ).toBeTruthy();
        // not for yourself, and not where there is nothing to reset
        for (const email of ['me@corp.io', 'bob@corp.io', 'cara@corp.io']) {
            expect(
                screen.queryByRole('button', {
                    name: `Reset two-factor of ${email}`,
                })
            ).toBeNull();
        }
    });

    it('asks first, then resets and says they were signed out', async () => {
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Reset two-factor of ann@corp.io',
            })
        );
        const dialog = await screen.findByRole('alertdialog');
        expect(dialog.textContent).toMatch(/ann@corp.io/);
        expect(dialog.textContent).toMatch(/signed out everywhere/);
        expect(adminResetMfa).not.toHaveBeenCalled();
        fireEvent.click(
            within(dialog).getByRole('button', { name: 'Reset two-factor' })
        );
        await waitFor(() => expect(adminResetMfa).toHaveBeenCalledWith('u2'));
        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Two-factor reset' })
            )
        );
    });

    it('asks for your own password before resetting another admin, and sends it', async () => {
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Reset two-factor of root@corp.io',
            })
        );
        const dialog = await screen.findByRole('alertdialog');
        const action = within(dialog).getByRole('button', {
            name: 'Reset two-factor',
        }) as HTMLButtonElement;
        // nothing to send yet
        expect(action.disabled).toBe(true);
        fireEvent.change(within(dialog).getByLabelText('Your password'), {
            target: { value: 'my-own-password' },
        });
        expect(action.disabled).toBe(false);
        fireEvent.click(action);
        await waitFor(() =>
            expect(adminResetMfa).toHaveBeenCalledWith('u5', {
                adminPassword: 'my-own-password',
            })
        );
    });

    it('keeps the dialog open and says so when the password is wrong', async () => {
        adminResetMfa.mockRejectedValue(new ApiError(403, 'wrong_password'));
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Reset two-factor of root@corp.io',
            })
        );
        const dialog = await screen.findByRole('alertdialog');
        fireEvent.change(within(dialog).getByLabelText('Your password'), {
            target: { value: 'nope' },
        });
        fireEvent.click(
            within(dialog).getByRole('button', { name: 'Reset two-factor' })
        );
        await waitFor(() =>
            expect(within(dialog).getByRole('alert').textContent).toMatch(
                /incorrect/
            )
        );
        expect(screen.queryByRole('alertdialog')).not.toBeNull();
    });

    it('asks for no proof for someone who is not an admin', async () => {
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Reset two-factor of ann@corp.io',
            })
        );
        const dialog = await screen.findByRole('alertdialog');
        expect(within(dialog).queryByLabelText('Your password')).toBeNull();
    });

    it('cancelling resets nothing', async () => {
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Reset two-factor of ann@corp.io',
            })
        );
        const dialog = await screen.findByRole('alertdialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        expect(adminResetMfa).not.toHaveBeenCalled();
    });

    it('shows the server refusing', async () => {
        adminResetMfa.mockRejectedValue(new ApiError(404, 'not_found'));
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Reset two-factor of ann@corp.io',
            })
        );
        const dialog = await screen.findByRole('alertdialog');
        fireEvent.click(
            within(dialog).getByRole('button', { name: 'Reset two-factor' })
        );
        expect((await screen.findByRole('alert')).textContent).toMatch(
            /Not found/
        );
    });
});
