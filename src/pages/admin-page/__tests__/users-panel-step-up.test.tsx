import React from 'react';
import {
    cleanup,
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
    row({ id: 'me', email: 'me@corp.io', isAdmin: true }),
    row({ id: 'u2', email: 'ann@corp.io' }),
    row({ id: 'u3', email: 'root@corp.io', isAdmin: true }),
];

const adminListUsers = vi.fn();
const adminUpdateUser = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        adminListUsers: (...a: unknown[]) => adminListUsers(...a),
        adminUpdateUser: (...a: unknown[]) => adminUpdateUser(...a),
        adminResetMfa: vi.fn(),
        adminCreateUser: vi.fn(),
        adminDeleteUser: vi.fn(),
        adminBulkUsers: vi.fn(),
        adminListUserSessions: vi.fn(),
        adminSignOutUser: vi.fn(),
        setupStatus: vi.fn().mockResolvedValue({
            needsSetup: false,
            passwordMinLength: 12,
        }),
    },
}));
const acting = vi.hoisted(() => ({ mfaEnabled: false }));
vi.mock('@/hooks/use-qubdi', () => ({
    useQubdi: () => ({ user: { id: 'me', mfaEnabled: acting.mfaEnabled } }),
}));
const toast = vi.fn();
vi.mock('@/platform/toast/use-toast', () => ({ useToast: () => ({ toast }) }));

const NEW = 'A-long-new-password-1!';

const openReset = async (email: string) => {
    fireEvent.click(
        screen.getByRole('button', { name: `Reset password of ${email}` })
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('New password'), {
        target: { value: NEW },
    });
    return dialog;
};
const setButton = (dialog: HTMLElement) =>
    within(dialog).getByRole('button', {
        name: 'Set password',
    }) as HTMLButtonElement;

describe('UsersPanel: resetting a password', () => {
    beforeEach(async () => {
        adminListUsers.mockReset();
        adminUpdateUser.mockReset();
        toast.mockReset();
        acting.mfaEnabled = false;
        adminListUsers.mockResolvedValue({
            items: users,
            total: users.length,
            page: 1,
            limit: 10,
        });
        adminUpdateUser.mockResolvedValue({
            id: 'x',
            isAdmin: false,
            isActive: true,
        });
        render(<UsersPanel currentUserId="me" />);
        await screen.findByText('ann@corp.io');
    });

    it('needs no proof for an account that is not an admin', async () => {
        const dialog = await openReset('ann@corp.io');
        expect(within(dialog).queryByLabelText('Your password')).toBeNull();
        fireEvent.click(setButton(dialog));
        await waitFor(() =>
            expect(adminUpdateUser).toHaveBeenCalledWith('u2', {
                password: NEW,
            })
        );
    });

    it('asks for your own password for another admin, holds the button until it is typed, and sends it', async () => {
        const dialog = await openReset('root@corp.io');
        expect(setButton(dialog).disabled).toBe(true);
        fireEvent.change(within(dialog).getByLabelText('Your password'), {
            target: { value: 'my-own-password' },
        });
        expect(setButton(dialog).disabled).toBe(false);
        fireEvent.click(setButton(dialog));
        await waitFor(() =>
            expect(adminUpdateUser).toHaveBeenCalledWith('u3', {
                password: NEW,
                adminPassword: 'my-own-password',
            })
        );
    });

    it('also asks for a code when your own account has two-factor on', async () => {
        acting.mfaEnabled = true;
        // the panel read the setting while rendering: render again with it on
        cleanup();
        render(<UsersPanel currentUserId="me" />);
        await screen.findAllByText('ann@corp.io');
        fireEvent.click(
            screen.getAllByRole('button', {
                name: 'Reset password of root@corp.io',
            })[0]
        );
        const dialog = await screen.findByRole('dialog');
        fireEvent.change(within(dialog).getByPlaceholderText('New password'), {
            target: { value: NEW },
        });
        fireEvent.change(within(dialog).getByLabelText('Your password'), {
            target: { value: 'my-own-password' },
        });
        // a password alone is not enough now
        expect(setButton(dialog).disabled).toBe(true);
        fireEvent.change(within(dialog).getByLabelText('Your code'), {
            target: { value: ' 123456 ' },
        });
        expect(setButton(dialog).disabled).toBe(false);
        fireEvent.click(setButton(dialog));
        await waitFor(() =>
            expect(adminUpdateUser).toHaveBeenCalledWith('u3', {
                password: NEW,
                adminPassword: 'my-own-password',
                adminCode: '123456',
            })
        );
    });

    it('keeps the dialog open and says so when the password is wrong', async () => {
        adminUpdateUser.mockRejectedValue(new ApiError(403, 'wrong_password'));
        const dialog = await openReset('root@corp.io');
        fireEvent.change(within(dialog).getByLabelText('Your password'), {
            target: { value: 'nope' },
        });
        fireEvent.click(setButton(dialog));
        await waitFor(() =>
            expect(within(dialog).getByRole('alert').textContent).toMatch(
                /incorrect/
            )
        );
        expect(screen.queryByRole('dialog')).not.toBeNull();
    });
});
