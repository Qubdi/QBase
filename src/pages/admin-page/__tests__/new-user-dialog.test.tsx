import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
        fireEvent.click(screen.getByLabelText('Make this user an admin'));
        fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
        await waitFor(() =>
            expect(onCreate).toHaveBeenCalledWith({
                email: 'ann@corp.io',
                password: 'Long-enough-pw-1!',
                isAdmin: true,
            })
        );
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
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
