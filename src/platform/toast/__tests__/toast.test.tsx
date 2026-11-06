import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Toaster } from '../toaster';
import { ToastAction } from '../toast';
import { resetToasts, toast } from '../use-toast';

afterEach(() => act(() => resetToasts()));

describe('toast', () => {
    it('shows a title and description', async () => {
        render(<Toaster />);
        act(() => {
            toast({ title: 'Saved', description: 'All done' });
        });
        expect(await screen.findByText('Saved')).toBeTruthy();
        expect(screen.getByText('All done')).toBeTruthy();
    });

    it('renders the destructive variant, an action and hides the close button', async () => {
        render(<Toaster />);
        act(() => {
            toast({
                title: 'Failed',
                variant: 'destructive',
                hideCloseButton: true,
                action: <ToastAction altText="Undo">Undo</ToastAction>,
            });
        });
        const title = await screen.findByText('Failed');
        expect(title.closest('li')?.className).toContain('destructive');
        expect(screen.getByText('Undo')).toBeTruthy();
        expect(screen.queryByLabelText('Close')).toBeNull();
    });

    it('dismiss closes it', async () => {
        render(<Toaster />);
        let handle!: ReturnType<typeof toast>;
        act(() => {
            handle = toast({ title: 'Bye' });
        });
        const item = (await screen.findByText('Bye')).closest('li');
        expect(item?.getAttribute('data-state')).toBe('open');
        act(() => handle.dismiss());
        await waitFor(() =>
            expect(item?.getAttribute('data-state')).toBe('closed')
        );
    });
});
