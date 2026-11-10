import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForcedPasswordChange } from '../forced-password-change';

const { setupStatus, changePassword, logout, refreshUser, state } = vi.hoisted(
    () => ({
        setupStatus: vi.fn(),
        changePassword: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
        state: {
            user: null as null | {
                id: string;
                email: string;
                isAdmin: boolean;
                mustChangePassword: boolean;
            },
        },
    })
);

vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        setupStatus: (...a: unknown[]) => setupStatus(...a),
        changePassword: (...a: unknown[]) => changePassword(...a),
    },
}));

vi.mock('@/hooks/use-qubdi', () => ({
    useQubdi: () => ({ user: state.user, logout, refreshUser }),
}));

const signedIn = (mustChangePassword: boolean) => {
    state.user = {
        id: 'u1',
        email: 'ann@corp.io',
        isAdmin: false,
        mustChangePassword,
    };
};

const fillIn = (current: string, next: string) => {
    fireEvent.change(screen.getByPlaceholderText('Current password'), {
        target: { value: current },
    });
    fireEvent.change(screen.getByLabelText('New password'), {
        target: { value: next },
    });
};

describe('ForcedPasswordChange', () => {
    beforeEach(() => {
        setupStatus.mockReset();
        setupStatus.mockResolvedValue({
            needsSetup: false,
            passwordMinLength: 12,
        });
        changePassword.mockReset();
        logout.mockReset();
        refreshUser.mockReset();
        refreshUser.mockResolvedValue(undefined);
        state.user = null;
    });

    it('shows nothing to someone who is signed out', () => {
        render(<ForcedPasswordChange />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('shows nothing to someone with a password of their own', () => {
        signedIn(false);
        render(<ForcedPasswordChange />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    describe('on a temporary password', () => {
        beforeEach(() => signedIn(true));

        it('opens over the page and says why', () => {
            render(<ForcedPasswordChange />);
            expect(screen.getByRole('dialog')).toBeTruthy();
            expect(screen.getByText('Choose your own password')).toBeTruthy();
            expect(screen.getByText(/temporary password/)).toBeTruthy();
        });

        it('cannot be dismissed: no close button, and Escape does nothing', () => {
            render(<ForcedPasswordChange />);
            expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
            fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
            expect(screen.getByRole('dialog')).toBeTruthy();
        });

        it('lets the person sign out instead', () => {
            render(<ForcedPasswordChange />);
            fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
            expect(logout).toHaveBeenCalledTimes(1);
        });

        it('holds the button until the new password meets the rules', () => {
            render(<ForcedPasswordChange />);
            fillIn('Temp-Pass-123!', 'weak');
            expect(
                (
                    screen.getByRole('button', {
                        name: 'Change password',
                    }) as HTMLButtonElement
                ).disabled
            ).toBe(true);
        });

        it('sends the change, then asks who is signed in so the dialog can go', async () => {
            changePassword.mockResolvedValue({ ok: true });
            render(<ForcedPasswordChange />);
            fillIn('Temp-Pass-123!', 'My-Own-Pass-456!');
            fireEvent.click(
                screen.getByRole('button', { name: 'Change password' })
            );
            await waitFor(() =>
                expect(changePassword).toHaveBeenCalledWith(
                    'Temp-Pass-123!',
                    'My-Own-Pass-456!'
                )
            );
            await waitFor(() => expect(refreshUser).toHaveBeenCalledTimes(1));
        });

        it('says so when the change worked but the page could not update', async () => {
            changePassword.mockResolvedValue({ ok: true });
            refreshUser.mockRejectedValue(new Error('offline'));
            render(<ForcedPasswordChange />);
            fillIn('Temp-Pass-123!', 'My-Own-Pass-456!');
            fireEvent.click(
                screen.getByRole('button', { name: 'Change password' })
            );
            const alert = await screen.findByRole('alert');
            expect(alert.textContent).toMatch(/password was changed/);
            expect(alert.textContent).toMatch(/Reload the page/);
        });

        it('stays open and says why when the server refuses', async () => {
            const { ApiError } = await import('@/lib/qubdi/api');
            changePassword.mockRejectedValue(
                new ApiError(403, 'wrong_password')
            );
            render(<ForcedPasswordChange />);
            fillIn('not-it', 'My-Own-Pass-456!');
            fireEvent.click(
                screen.getByRole('button', { name: 'Change password' })
            );
            expect(await screen.findByRole('alert')).toBeTruthy();
            expect(refreshUser).not.toHaveBeenCalled();
            expect(screen.getByRole('dialog')).toBeTruthy();
        });
    });
});
