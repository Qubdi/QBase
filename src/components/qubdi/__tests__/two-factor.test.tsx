import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/qubdi/api';
import { resetPasswordMinLength } from '@/hooks/use-password-min-length';
import { AuthDialog } from '../auth-dialog';
import { ChangePasswordDialog } from '../change-password-dialog';
import { TwoFactorDialog } from '../two-factor-dialog';

const mocks = vi.hoisted(() => ({
    setupStatus: vi.fn(),
    changePassword: vi.fn(),
    mfaStatus: vi.fn(),
    mfaSetup: vi.fn(),
    mfaEnable: vi.fn(),
    mfaDisable: vi.fn(),
    mfaNewRecoveryCodes: vi.fn(),
    login: vi.fn(),
    loginMfa: vi.fn(),
    register: vi.fn(),
    refreshUser: vi.fn(),
    user: {
        id: 'u1',
        email: 'anna@corp.io',
        isAdmin: false,
        mfaEnabled: false,
    } as { id: string; email: string; isAdmin: boolean; mfaEnabled: boolean },
}));

vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        setupStatus: (...a: unknown[]) => mocks.setupStatus(...a),
        changePassword: (...a: unknown[]) => mocks.changePassword(...a),
        mfaStatus: (...a: unknown[]) => mocks.mfaStatus(...a),
        mfaSetup: (...a: unknown[]) => mocks.mfaSetup(...a),
        mfaEnable: (...a: unknown[]) => mocks.mfaEnable(...a),
        mfaDisable: (...a: unknown[]) => mocks.mfaDisable(...a),
        mfaNewRecoveryCodes: (...a: unknown[]) =>
            mocks.mfaNewRecoveryCodes(...a),
    },
}));

vi.mock('@/hooks/use-qubdi', () => ({
    useQubdi: () => ({
        login: mocks.login,
        loginMfa: mocks.loginMfa,
        register: mocks.register,
        refreshUser: mocks.refreshUser,
        logout: vi.fn(),
        user: mocks.user,
    }),
}));

// the picture is drawn by a library that needs a canvas
vi.mock('qrcode', () => ({
    default: {
        toDataURL: vi.fn(async (text: string) => `data:image/png;qr=${text}`),
    },
}));

const type = (label: string | RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const button = (name: string | RegExp) =>
    screen.getByRole('button', { name }) as HTMLButtonElement;

beforeEach(() => {
    for (const m of Object.values(mocks)) {
        if (typeof m === 'function' && 'mockReset' in m) m.mockReset();
    }
    mocks.user = {
        id: 'u1',
        email: 'anna@corp.io',
        isAdmin: false,
        mfaEnabled: false,
    };
    resetPasswordMinLength();
    mocks.setupStatus.mockResolvedValue({
        needsSetup: false,
        passwordMinLength: 12,
        mfaAvailable: true,
    });
    mocks.refreshUser.mockResolvedValue(undefined);
});

describe('sign-in: the second step', () => {
    const toCodeStep = async () => {
        mocks.login.mockResolvedValue({ mfaChallenge: 'ticket-1' });
        render(<AuthDialog open onOpenChange={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText('Email'), {
            target: { value: 'anna@corp.io' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
            target: { value: 'Correct-Horse-1' },
        });
        fireEvent.click(button('Sign in'));
        await screen.findByTestId('mfa-form');
    };

    it('asks for the code after the password, with a one-time-code number field', async () => {
        await toCodeStep();
        expect(mocks.login).toHaveBeenCalledWith(
            'anna@corp.io',
            'Correct-Horse-1'
        );
        const field = screen.getByLabelText('Authenticator code');
        expect(field.getAttribute('autocomplete')).toBe('one-time-code');
        expect(field.getAttribute('inputmode')).toBe('numeric');
        // the password is gone from the screen
        expect(screen.queryByPlaceholderText('Password')).toBeNull();
    });

    it('sends the ticket and the six digits, then closes', async () => {
        const onOpenChange = vi.fn();
        mocks.login.mockResolvedValue({ mfaChallenge: 'ticket-1' });
        mocks.loginMfa.mockResolvedValue(undefined);
        render(<AuthDialog open onOpenChange={onOpenChange} />);
        fireEvent.change(screen.getByPlaceholderText('Email'), {
            target: { value: 'anna@corp.io' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
            target: { value: 'Correct-Horse-1' },
        });
        fireEvent.click(button('Sign in'));
        await screen.findByTestId('mfa-form');

        expect(button('Verify').disabled).toBe(true);
        type('Authenticator code', '123 456');
        expect(button('Verify').disabled).toBe(false);
        fireEvent.click(button('Verify'));
        await waitFor(() =>
            expect(mocks.loginMfa).toHaveBeenCalledWith('ticket-1', {
                code: '123456',
            })
        );
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it('takes a recovery code instead', async () => {
        mocks.loginMfa.mockResolvedValue(undefined);
        await toCodeStep();
        fireEvent.click(button('Use a recovery code instead'));
        type('Recovery code', 'ABCDE-FGHJK');
        fireEvent.click(button('Verify'));
        await waitFor(() =>
            expect(mocks.loginMfa).toHaveBeenCalledWith('ticket-1', {
                recoveryCode: 'ABCDE-FGHJK',
            })
        );
    });

    it('says a code is wrong and stays on the step', async () => {
        mocks.loginMfa.mockRejectedValue(new ApiError(401, 'invalid_code'));
        await toCodeStep();
        type('Authenticator code', '000000');
        fireEvent.click(button('Verify'));
        expect((await screen.findByRole('alert')).textContent).toMatch(
            /not right/
        );
        expect(screen.getByTestId('mfa-form')).toBeTruthy();
    });

    it('goes back to the password when the ticket ran out', async () => {
        mocks.loginMfa.mockRejectedValue(
            new ApiError(401, 'invalid_challenge')
        );
        await toCodeStep();
        type('Authenticator code', '000000');
        fireEvent.click(button('Verify'));
        await screen.findByPlaceholderText('Password');
        expect(screen.getByRole('alert').textContent).toMatch(/password again/);
    });

    it('Back returns to the password', async () => {
        await toCodeStep();
        fireEvent.click(button('Back'));
        await screen.findByPlaceholderText('Password');
    });

    it('signs in with the password alone when there is no second step', async () => {
        const onOpenChange = vi.fn();
        mocks.login.mockResolvedValue(undefined);
        render(<AuthDialog open onOpenChange={onOpenChange} />);
        fireEvent.change(screen.getByPlaceholderText('Email'), {
            target: { value: 'anna@corp.io' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
            target: { value: 'Correct-Horse-1' },
        });
        fireEvent.click(button('Sign in'));
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        expect(screen.queryByTestId('mfa-form')).toBeNull();
    });
});

describe('two-factor dialog', () => {
    const codes = ['AAAAA-BBBBB', 'CCCCC-DDDDD', 'EEEEE-FFFFF'];
    const off = { available: true, enabled: false, enabledAt: null };
    const on = {
        available: true,
        enabled: true,
        enabledAt: '2026-10-01T10:00:00Z',
        recoveryCodesLeft: 8,
    };

    it('says it is not available when the server has no key', async () => {
        mocks.mfaStatus.mockResolvedValue({ ...off, available: false });
        render(<TwoFactorDialog open onOpenChange={vi.fn()} />);
        await screen.findByText(/not available on this server/);
        expect(screen.queryByRole('button', { name: 'Set up' })).toBeNull();
    });

    it('walks through set-up: key and QR, a code, then recovery codes that must be saved', async () => {
        const onOpenChange = vi.fn();
        mocks.mfaStatus.mockResolvedValueOnce({
            ...off,
            recoveryCodesLeft: 0,
        });
        mocks.mfaStatus.mockResolvedValue(on);
        mocks.mfaSetup.mockResolvedValue({
            secret: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
            otpauthUrl: 'otpauth://totp/QubdiDB:anna?secret=ABC',
        });
        mocks.mfaEnable.mockResolvedValue({ recoveryCodes: codes });
        render(<TwoFactorDialog open onOpenChange={onOpenChange} />);

        fireEvent.click(await screen.findByRole('button', { name: 'Set up' }));
        const setup = await screen.findByTestId('mfa-setup');
        // 1 install an app, 2 the QR code and the key to type
        expect(setup.textContent).toMatch(/Google Authenticator/);
        expect(screen.getByTestId('mfa-key').textContent).toBe(
            'ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567'
        );
        const qr = await screen.findByAltText(
            'QR code for your authenticator app'
        );
        expect(qr.getAttribute('src')).toContain(
            'otpauth://totp/QubdiDB:anna?secret=ABC'
        );

        // 3 a real code, and the password: neither alone is enough
        expect(button('Turn on').disabled).toBe(true);
        type('Authenticator code', '654 321');
        expect(button('Turn on').disabled).toBe(true);
        fireEvent.change(screen.getByPlaceholderText('Password'), {
            target: { value: 'Password-123!' },
        });
        expect(button('Turn on').disabled).toBe(false);
        fireEvent.click(button('Turn on'));
        await waitFor(() =>
            expect(mocks.mfaEnable).toHaveBeenCalledWith(
                'Password-123!',
                '654321'
            )
        );
        expect(mocks.refreshUser).toHaveBeenCalled();

        // 4 recovery codes: copy and download, and no way out until confirmed
        const list = await screen.findByRole('list', {
            name: 'Recovery codes',
        });
        expect(within(list).getAllByRole('listitem')).toHaveLength(3);
        expect(button(/Copy/)).toBeTruthy();
        expect(button(/Download/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onOpenChange).not.toHaveBeenCalled();
        expect(button('Done').disabled).toBe(true);

        fireEvent.click(
            screen.getByRole('checkbox', { name: 'I have saved these codes' })
        );
        expect(button('Done').disabled).toBe(false);
        fireEvent.click(button('Done'));
        await screen.findByText(/8 unused/);
    });

    it('shows a wrong code and stays on set-up', async () => {
        mocks.mfaStatus.mockResolvedValue({ ...off, recoveryCodesLeft: 0 });
        mocks.mfaSetup.mockResolvedValue({
            secret: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
            otpauthUrl: 'otpauth://totp/x',
        });
        mocks.mfaEnable.mockRejectedValue(new ApiError(400, 'invalid_code'));
        render(<TwoFactorDialog open onOpenChange={vi.fn()} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Set up' }));
        await screen.findByTestId('mfa-setup');
        type('Authenticator code', '000000');
        fireEvent.change(screen.getByPlaceholderText('Password'), {
            target: { value: 'Password-123!' },
        });
        fireEvent.click(button('Turn on'));
        expect((await screen.findByRole('alert')).textContent).toMatch(
            /not right/
        );
        expect(screen.getByTestId('mfa-setup')).toBeTruthy();
    });

    it('when on: shows since when and how many codes are left', async () => {
        mocks.mfaStatus.mockResolvedValue(on);
        render(<TwoFactorDialog open onOpenChange={vi.fn()} />);
        const text = await screen.findByText(/It is/);
        expect(text.parentElement?.textContent).toMatch(/on since/);
        expect(text.parentElement?.textContent).toMatch(
            /8 unused recovery codes/
        );
    });

    it('turns off with the password and a code (or a recovery code)', async () => {
        mocks.mfaStatus.mockResolvedValueOnce(on);
        mocks.mfaStatus.mockResolvedValue({ ...off, recoveryCodesLeft: 0 });
        mocks.mfaDisable.mockResolvedValue({ ok: true });
        render(<TwoFactorDialog open onOpenChange={vi.fn()} />);
        fireEvent.click(
            await screen.findByRole('button', { name: 'Turn off' })
        );
        await screen.findByTestId('mfa-disable');
        expect(button('Turn off two-factor').disabled).toBe(true);
        type('Password', 'Correct-Horse-1');
        type('Authenticator or recovery code', 'abcde-fghjk');
        fireEvent.click(button('Turn off two-factor'));
        await waitFor(() =>
            expect(mocks.mfaDisable).toHaveBeenCalledWith('Correct-Horse-1', {
                recoveryCode: 'abcde-fghjk',
            })
        );
        await screen.findByRole('button', { name: 'Set up' });
        expect(mocks.refreshUser).toHaveBeenCalled();
    });

    it('a six-digit entry is sent as a code', async () => {
        mocks.mfaStatus.mockResolvedValueOnce(on);
        mocks.mfaStatus.mockResolvedValue({ ...off, recoveryCodesLeft: 0 });
        mocks.mfaDisable.mockResolvedValue({ ok: true });
        render(<TwoFactorDialog open onOpenChange={vi.fn()} />);
        fireEvent.click(
            await screen.findByRole('button', { name: 'Turn off' })
        );
        await screen.findByTestId('mfa-disable');
        type('Password', 'Correct-Horse-1');
        type('Authenticator or recovery code', '123 456');
        fireEvent.click(button('Turn off two-factor'));
        await waitFor(() =>
            expect(mocks.mfaDisable).toHaveBeenCalledWith('Correct-Horse-1', {
                code: '123456',
            })
        );
    });

    it('makes new recovery codes and shows them to be saved', async () => {
        mocks.mfaStatus.mockResolvedValue(on);
        mocks.mfaNewRecoveryCodes.mockResolvedValue({ recoveryCodes: codes });
        render(<TwoFactorDialog open onOpenChange={vi.fn()} />);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Make new recovery codes',
            })
        );
        await screen.findByTestId('mfa-renew');
        type('Password', 'Correct-Horse-1');
        type('Authenticator code', '111 222');
        fireEvent.click(
            within(screen.getByTestId('mfa-renew')).getByRole('button', {
                name: 'Make new recovery codes',
            })
        );
        await waitFor(() =>
            expect(mocks.mfaNewRecoveryCodes).toHaveBeenCalledWith(
                'Correct-Horse-1',
                '111222'
            )
        );
        await screen.findByRole('list', { name: 'Recovery codes' });
    });
});

describe('change password with two-factor on', () => {
    it('asks for a code and sends it along', async () => {
        mocks.user = { ...mocks.user, mfaEnabled: true };
        mocks.changePassword.mockResolvedValue({ ok: true });
        render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText('Current password'), {
            target: { value: 'Old-Password-1!' },
        });
        fireEvent.change(screen.getByPlaceholderText('New password'), {
            target: { value: 'Brand-New-Passw0rd!x' },
        });
        type('Authenticator or recovery code', '123456');
        fireEvent.click(button('Change password'));
        await waitFor(() =>
            expect(mocks.changePassword).toHaveBeenCalledWith(
                'Old-Password-1!',
                'Brand-New-Passw0rd!x',
                { code: '123456' }
            )
        );
    });

    it('does not ask without it', () => {
        render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);
        expect(
            screen.queryByLabelText('Authenticator or recovery code')
        ).toBeNull();
    });
});
