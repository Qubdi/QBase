import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInPrompt } from '../sign-in-prompt';

vi.mock('../auth-dialog', () => ({ AuthDialog: () => null }));

const { setupStatus } = vi.hoisted(() => ({ setupStatus: vi.fn() }));

vi.mock('@/lib/qubdi/api', () => ({
    api: { setupStatus: (...a: unknown[]) => setupStatus(...a) },
}));

describe('SignInPrompt', () => {
    beforeEach(() => {
        setupStatus.mockReset();
    });

    it('points a brand-new server at creating the admin account', async () => {
        setupStatus.mockResolvedValue({ needsSetup: true });
        render(<SignInPrompt verb="see" />);
        expect(
            await screen.findByRole('button', { name: 'Create admin account' })
        ).toBeTruthy();
        expect(screen.getByText(/no users yet/)).toBeTruthy();
    });

    it('asks for a sign-in once the server has users', async () => {
        setupStatus.mockResolvedValue({ needsSetup: false });
        render(<SignInPrompt verb="open" />);
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
        expect(screen.getByText(/Sign in to open your projects/)).toBeTruthy();
        await waitFor(() => expect(setupStatus).toHaveBeenCalled());
        expect(screen.queryByText(/no users yet/)).toBeNull();
    });

    it('falls back to the sign-in text when the status call fails', async () => {
        setupStatus.mockRejectedValue(new Error('offline'));
        render(<SignInPrompt verb="see" />);
        expect(
            await screen.findByRole('button', { name: 'Sign in' })
        ).toBeTruthy();
        expect(setupStatus).toHaveBeenCalledTimes(1);
    });
});
