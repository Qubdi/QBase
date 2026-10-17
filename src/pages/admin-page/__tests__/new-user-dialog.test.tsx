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
        fill(' ann@corp.io ', 'long-enough-pw');
        fireEvent.click(screen.getByLabelText('Make this user an admin'));
        fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
        await waitFor(() =>
            expect(onCreate).toHaveBeenCalledWith({
                email: 'ann@corp.io',
                password: 'long-enough-pw',
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
        fill('ann@corp.io', 'long-enough-pw');
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
