import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPasswordMinLength } from '@/hooks/use-password-min-length';
import { AuthDialog } from '../auth-dialog';
import { ChangePasswordDialog } from '../change-password-dialog';

const { setupStatus, changePassword, login, register } = vi.hoisted(() => ({
    setupStatus: vi.fn(),
    changePassword: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
}));

vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        setupStatus: (...a: unknown[]) => setupStatus(...a),
        changePassword: (...a: unknown[]) => changePassword(...a),
    },
}));

vi.mock('@/hooks/use-qubdi', () => ({
    useQubdi: () => ({
        login,
        register,
        user: { id: 'u1', email: 'anna.smith@corp.io', isAdmin: false },
    }),
}));

const button = (name: string) =>
    screen.getByRole('button', { name }) as HTMLButtonElement;

describe('password dialogs', () => {
    beforeEach(() => {
        setupStatus.mockReset();
        changePassword.mockReset();
        login.mockReset();
        register.mockReset();
        resetPasswordMinLength();
    });

    describe('sign-in', () => {
        beforeEach(() => {
            setupStatus.mockResolvedValue({
                needsSetup: false,
                passwordMinLength: 12,
            });
        });

        it('takes any password: the rules are for choosing one, not for signing in', async () => {
            login.mockResolvedValue(undefined);
            render(<AuthDialog open onOpenChange={vi.fn()} />);
            expect(
                screen.queryByRole('list', { name: 'Password rules' })
            ).toBeNull();
            fireEvent.change(screen.getByPlaceholderText('Email'), {
                target: { value: 'old@corp.io' },
            });
            // an old, weak password
            fireEvent.change(screen.getByPlaceholderText('Password'), {
                target: { value: 'password123' },
            });
            expect(button('Sign in').disabled).toBe(false);
            fireEvent.click(button('Sign in'));
            await waitFor(() =>
                expect(login).toHaveBeenCalledWith('old@corp.io', 'password123')
            );
        });
    });

    describe('first admin account', () => {
        beforeEach(() => {
            setupStatus.mockResolvedValue({
                needsSetup: true,
                passwordMinLength: 14,
            });
        });

        it('shows the rules with the real minimum and holds the button until they are met', async () => {
            render(<AuthDialog open onOpenChange={vi.fn()} />);
            expect(
                await screen.findByRole('button', {
                    name: 'Create admin account',
                })
            ).toBeTruthy();
            await screen.findByText(/At least 14 characters/);
            fireEvent.change(screen.getByPlaceholderText('Email'), {
                target: { value: 'founder@corp.io' },
            });
            const password = screen.getByLabelText('Password');
            fireEvent.change(password, { target: { value: 'short' } });
            expect(button('Create admin account').disabled).toBe(true);
            fireEvent.change(password, {
                target: { value: 'Long-enough-pw-1!' },
            });
            expect(button('Create admin account').disabled).toBe(false);
        });

        it('does not accept a password made from the email', async () => {
            render(<AuthDialog open onOpenChange={vi.fn()} />);
            await screen.findByText(/At least 14 characters/);
            fireEvent.change(screen.getByPlaceholderText('Email'), {
                target: { value: 'founder@corp.io' },
            });
            fireEvent.change(screen.getByLabelText('Password'), {
                target: { value: 'Founder-Founder-1!' },
            });
            expect(button('Create admin account').disabled).toBe(true);
        });
    });

    describe('change password', () => {
        beforeEach(() => {
            setupStatus.mockResolvedValue({
                needsSetup: false,
                passwordMinLength: 12,
            });
        });

        it('holds the button while the new password is weak, then sends it', async () => {
            changePassword.mockResolvedValue({ ok: true });
            render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);
            fireEvent.change(screen.getByPlaceholderText('Current password'), {
                target: { value: 'old-password' },
            });
            const next = screen.getByLabelText('New password');
            fireEvent.change(next, { target: { value: 'weak' } });
            expect(button('Change password').disabled).toBe(true);
            fireEvent.change(next, { target: { value: 'Brand-New-Pw-7?' } });
            expect(button('Change password').disabled).toBe(false);
            fireEvent.click(button('Change password'));
            await waitFor(() =>
                expect(changePassword).toHaveBeenCalledWith(
                    'old-password',
                    'Brand-New-Pw-7?'
                )
            );
        });

        it('sends once however often it is submitted while the request is on its way', async () => {
            let finish!: (v: unknown) => void;
            changePassword.mockReturnValue(
                new Promise((resolve) => (finish = resolve))
            );
            render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);
            fireEvent.change(screen.getByPlaceholderText('Current password'), {
                target: { value: 'old-password' },
            });
            fireEvent.change(screen.getByLabelText('New password'), {
                target: { value: 'Brand-New-Pw-7?' },
            });
            const form = button('Change password').closest('form')!;
            fireEvent.submit(form);
            fireEvent.submit(form);
            await waitFor(() => expect(button('Change password').disabled).toBe(true));
            fireEvent.submit(form);
            expect(changePassword).toHaveBeenCalledTimes(1);
            finish({ ok: true });
            await waitFor(() => expect(screen.getByText(/changed|updated/i)).toBeTruthy());
            expect(changePassword).toHaveBeenCalledTimes(1);
        });

        it('uses the signed-in email for the email rule', () => {
            render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);
            fireEvent.change(screen.getByLabelText('New password'), {
                target: { value: 'My-Anna.Smith-99' },
            });
            expect(button('Change password').disabled).toBe(true);
        });
    });
});
