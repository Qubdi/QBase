import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const acting = vi.hoisted(() => ({ mfaEnabled: false }));
vi.mock('@/hooks/use-qubdi', () => ({
    useQubdi: () => ({ user: { id: 'me', mfaEnabled: acting.mfaEnabled } }),
}));
import { NewUserDialog } from '../new-user-dialog';

const fill = (email: string, password: string) => {
    fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: email },
    });
    fireEvent.change(screen.getByLabelText('Temporary password'), {
        target: { value: password },
    });
};

describe('NewUserDialog', () => {
    it('creates the account with what was typed and closes', async () => {
        const onCreate = vi.fn().mockResolvedValue(undefined);
        const onOpenChange = vi.fn();
        render(
            <NewUserDialog
                open
                onOpenChange={onOpenChange}
                onCreate={onCreate}
            />
        );
        fill(' ann@corp.io ', 'Long-enough-pw-1!');
        fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
        await waitFor(() =>
            expect(onCreate).toHaveBeenCalledWith({
                email: 'ann@corp.io',
                password: 'Long-enough-pw-1!',
                isAdmin: false,
            })
        );
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it('SEC-037: making an administrator asks for your own password, holds Create until it is typed, and sends it', async () => {
        acting.mfaEnabled = false;
        const onCreate = vi.fn().mockResolvedValue(undefined);
        render(
            <NewUserDialog open onOpenChange={vi.fn()} onCreate={onCreate} />
        );
        fill('ann@corp.io', 'Long-enough-pw-1!');
        expect(screen.queryByLabelText('Your password')).toBeNull();
        fireEvent.click(screen.getByLabelText('Make this user an admin'));
        const create = screen.getByRole('button', {
            name: 'Create user',
        }) as HTMLButtonElement;
        expect(create.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Your password'), {
            target: { value: 'my-own-password' },
        });
        expect(create.disabled).toBe(false);
        fireEvent.click(create);
        await waitFor(() =>
            expect(onCreate).toHaveBeenCalledWith({
                email: 'ann@corp.io',
                password: 'Long-enough-pw-1!',
                isAdmin: true,
                adminPassword: 'my-own-password',
            })
        );
    });

    it('also asks for a code when your own account has two-factor on', async () => {
        acting.mfaEnabled = true;
        const onCreate = vi.fn().mockResolvedValue(undefined);
        render(
            <NewUserDialog open onOpenChange={vi.fn()} onCreate={onCreate} />
        );
        fill('ann@corp.io', 'Long-enough-pw-1!');
        fireEvent.click(screen.getByLabelText('Make this user an admin'));
        fireEvent.change(screen.getByLabelText('Your password'), {
            target: { value: 'my-own-password' },
        });
        const create = screen.getByRole('button', {
            name: 'Create user',
        }) as HTMLButtonElement;
        expect(create.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Your code'), {
            target: { value: ' 123456 ' },
        });
        fireEvent.click(create);
        await waitFor(() =>
            expect(onCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    adminPassword: 'my-own-password',
                    adminCode: '123456',
                })
            )
        );
        acting.mfaEnabled = false;
    });

    it('stays open and says why when the server refuses', async () => {
        const onCreate = vi.fn().mockRejectedValue(new Error('email_taken'));
        const onOpenChange = vi.fn();
        render(
            <NewUserDialog
                open
                onOpenChange={onOpenChange}
                onCreate={onCreate}
            />
        );
        fill('ann@corp.io', 'Long-enough-pw-1!');
        fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it('cannot be submitted while empty', () => {
        render(
            <NewUserDialog open onOpenChange={vi.fn()} onCreate={vi.fn()} />
        );
        expect(
            (
                screen.getByRole('button', {
                    name: 'Create user',
                }) as HTMLButtonElement
            ).disabled
        ).toBe(true);
    });
});

describe('NewUserDialog password rules', () => {
    it('holds the button until the temporary password meets the rules', () => {
        render(
            <NewUserDialog open onOpenChange={vi.fn()} onCreate={vi.fn()} />
        );
        const create = screen.getByRole('button', {
            name: 'Create user',
        }) as HTMLButtonElement;
        fill('ann@corp.io', 'password123');
        expect(create.disabled).toBe(true);
        fill('ann@corp.io', 'Long-enough-pw-1!');
        expect(create.disabled).toBe(false);
    });

    it('does not accept a password made from the new email', () => {
        render(
            <NewUserDialog open onOpenChange={vi.fn()} onCreate={vi.fn()} />
        );
        fill('annabel@corp.io', 'Annabel-Annabel-1!');
        expect(
            (
                screen.getByRole('button', {
                    name: 'Create user',
                }) as HTMLButtonElement
            ).disabled
        ).toBe(true);
    });
});
