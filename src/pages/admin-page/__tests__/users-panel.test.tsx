import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@/lib/qubdi/api';
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
    row({ id: 'u2', email: 'ann@corp.io', projects: 2 }),
    row({ id: 'u3', email: 'old@corp.io', isActive: false }),
];

const adminListUsers = vi.fn();
const adminUpdateUser = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        adminListUsers: (...a: unknown[]) => adminListUsers(...a),
        adminUpdateUser: (...a: unknown[]) => adminUpdateUser(...a),
        adminCreateUser: vi.fn(),
        adminDeleteUser: vi.fn(),
    },
}));

const page = (items: AdminUser[]) => ({
    items,
    total: items.length,
    page: 1,
    limit: 10,
});

const rowFor = (email: string) =>
    screen.getByText(email).closest('tr') as HTMLElement;

describe('UsersPanel status', () => {
    beforeEach(() => {
        adminListUsers.mockReset();
        adminUpdateUser.mockReset();
        adminListUsers.mockImplementation(async (p: { status?: string }) =>
            page(
                users.filter(
                    (u) => !p.status || (p.status === 'active') === u.isActive
                )
            )
        );
        adminUpdateUser.mockResolvedValue({});
    });

    it('shows each user as active or disabled', async () => {
        render(<UsersPanel currentUserId="me" />);
        await screen.findByText('ann@corp.io');
        expect(within(rowFor('ann@corp.io')).getByText('Active')).toBeTruthy();
        expect(
            within(rowFor('old@corp.io')).getByText('Disabled')
        ).toBeTruthy();
    });

    it('offers Disable for an active user and Enable for a disabled one', async () => {
        render(<UsersPanel currentUserId="me" />);
        await screen.findByText('ann@corp.io');
        expect(within(rowFor('ann@corp.io')).getByText('Disable')).toBeTruthy();
        expect(within(rowFor('old@corp.io')).getByText('Enable')).toBeTruthy();
    });

    it('disables a user through the API and reloads the list', async () => {
        render(<UsersPanel currentUserId="me" />);
        await screen.findByText('ann@corp.io');
        const callsBefore = adminListUsers.mock.calls.length;
        fireEvent.click(within(rowFor('ann@corp.io')).getByText('Disable'));
        await waitFor(() =>
            expect(adminUpdateUser).toHaveBeenCalledWith('u2', {
                isActive: false,
            })
        );
        await waitFor(() =>
            expect(adminListUsers.mock.calls.length).toBeGreaterThan(
                callsBefore
            )
        );
    });

    it('enables a disabled user through the API', async () => {
        render(<UsersPanel currentUserId="me" />);
        await screen.findByText('old@corp.io');
        fireEvent.click(within(rowFor('old@corp.io')).getByText('Enable'));
        await waitFor(() =>
            expect(adminUpdateUser).toHaveBeenCalledWith('u3', {
                isActive: true,
            })
        );
    });

    it('does not let an admin disable their own account', async () => {
        render(<UsersPanel currentUserId="me" />);
        await screen.findByText('me@corp.io');
        const button = within(rowFor('me@corp.io')).getByText('Disable');
        expect((button as HTMLButtonElement).disabled).toBe(true);
    });

    it('filters by status through the API', async () => {
        render(<UsersPanel currentUserId="me" />);
        await screen.findByText('ann@corp.io');
        fireEvent.click(screen.getByRole('button', { name: 'Disabled' }));
        await waitFor(() =>
            expect(adminListUsers).toHaveBeenLastCalledWith(
                expect.objectContaining({ status: 'disabled' })
            )
        );
        await waitFor(() =>
            expect(screen.queryByText('ann@corp.io')).toBeNull()
        );
        expect(screen.getByText('old@corp.io')).toBeTruthy();
        expect(
            screen
                .getByRole('button', { name: 'Disabled' })
                .getAttribute('aria-pressed')
        ).toBe('true');
    });

    it('goes back to all users when All is chosen', async () => {
        render(<UsersPanel currentUserId="me" />);
        await screen.findByText('ann@corp.io');
        fireEvent.click(screen.getByRole('button', { name: 'Disabled' }));
        await waitFor(() =>
            expect(screen.queryByText('ann@corp.io')).toBeNull()
        );
        fireEvent.click(screen.getByRole('button', { name: 'All' }));
        expect(await screen.findByText('ann@corp.io')).toBeTruthy();
        expect(adminListUsers).toHaveBeenLastCalledWith(
            expect.objectContaining({ status: undefined })
        );
    });

    it('explains an empty filter', async () => {
        adminListUsers.mockImplementation(async () => page([]));
        render(<UsersPanel currentUserId="me" />);
        fireEvent.click(
            await screen.findByRole('button', { name: 'Disabled' })
        );
        expect(await screen.findByText('No disabled users.')).toBeTruthy();
    });
});
