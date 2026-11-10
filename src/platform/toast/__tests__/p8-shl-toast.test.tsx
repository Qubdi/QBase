import React, { useState } from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { createMemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/features/designs/confirm-dialog';
import { ToastAction } from '../toast';
import { Toaster } from '../toaster';
import { toast } from '../use-toast';

afterEach(() => {
    vi.useRealTimers();
});

describe('toasts (SHL-087, SHL-088, SHL-089)', () => {
    it('SHL-087: one toast at a time: a new toast replaces the old one', async () => {
        render(<Toaster />);
        act(() => {
            toast({ title: 'First' });
        });
        await screen.findByText('First');
        act(() => {
            toast({ title: 'Second' });
        });
        await screen.findByText('Second');
        expect(screen.queryByText('First')).toBeNull();
        expect(screen.getAllByRole('status')).toHaveLength(1);
    });

    it('SHL-087: title, description, action, close button, default and destructive variants', async () => {
        render(<Toaster />);
        act(() => {
            toast({
                title: 'Heads up',
                description: 'Details',
                action: <ToastAction altText="Go">Go</ToastAction>,
            });
        });
        await screen.findByText('Heads up');
        expect(screen.getByText('Details')).toBeTruthy();
        expect(screen.getByText('Go')).toBeTruthy();
        expect(screen.getByRole('button', { name: /close/i })).toBeTruthy();
        const li = screen.getByText('Heads up').closest('li')!;
        expect(li.className).not.toContain('destructive');
        act(() => {
            toast({ title: 'Broke', variant: 'destructive' });
        });
        const bad = (await screen.findByText('Broke')).closest('li')!;
        expect(bad.className).toContain('destructive');
    });

    it('SHL-088: a toast closes by itself after about five seconds', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        render(<Toaster />);
        act(() => {
            toast({ title: 'Passing' });
        });
        expect(await screen.findByText('Passing')).toBeTruthy();
        const item = () => screen.getByText('Passing').closest('li')!;
        expect(item().getAttribute('data-state')).toBe('open');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(4500);
        });
        expect(item().getAttribute('data-state')).toBe('open');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
        // it is either closing or already gone
        const gone = screen.queryByText('Passing');
        expect(
            gone === null ||
                gone.closest('li')!.getAttribute('data-state') === 'closed'
        ).toBe(true);
    });

    it('SHL-089: the app mounts the toast stack at its root, beside the router', async () => {
        vi.resetModules();
        const router = createMemoryRouter([
            { path: '*', element: <div>a page</div> },
        ]);
        vi.doMock('@/platform/router/router', () => ({
            createAppRouter: () => router,
        }));
        // the session provider would ask a server; this test is about the toasts
        vi.doMock('@/context/qubdi-context/qubdi-provider', () => ({
            QubdiProvider: ({ children }: React.PropsWithChildren) => (
                <>{children}</>
            ),
        }));
        vi.doMock('@/components/qubdi/forced-password-change', () => ({
            ForcedPasswordChange: () => null,
        }));
        const { App } = await import('../../../app');
        const fresh = await import('../use-toast');
        render(<App />);
        await screen.findByText('a page');
        act(() => {
            fresh.toast({ title: 'From anywhere' });
        });
        expect(await screen.findByText('From anywhere')).toBeTruthy();
        // and a toast outlives a change of page
        await act(async () => {
            await router.navigate('/elsewhere');
        });
        expect(screen.getByText('From anywhere')).toBeTruthy();
        vi.doUnmock('@/platform/router/router');
        vi.doUnmock('@/context/qubdi-context/qubdi-provider');
        vi.doUnmock('@/components/qubdi/forced-password-change');
    });
});

describe('confirm dialog (SHL-090)', () => {
    const Host: React.FC<{ onConfirm: () => void }> = ({ onConfirm }) => {
        const [open, setOpen] = useState(true);
        return (
            <>
                <span>{open ? 'is open' : 'is closed'}</span>
                <ConfirmDialog
                    open={open}
                    title="Delete diagram?"
                    description="This cannot be undone."
                    confirmLabel="Yes, delete"
                    cancelLabel="Keep it"
                    destructive
                    onConfirm={() => {
                        onConfirm();
                        setOpen(false);
                    }}
                    onCancel={() => setOpen(false)}
                />
            </>
        );
    };

    it('shows the title, description and both labels', async () => {
        render(<Host onConfirm={() => undefined} />);
        const dialog = await screen.findByRole('alertdialog');
        expect(dialog.textContent).toContain('Delete diagram?');
        expect(dialog.textContent).toContain('This cannot be undone.');
        expect(
            screen.getByRole('button', { name: 'Yes, delete' })
        ).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Keep it' })).toBeTruthy();
    });

    it('confirming runs the action, then closes', async () => {
        const run = vi.fn();
        render(<Host onConfirm={run} />);
        fireEvent.click(
            await screen.findByRole('button', { name: 'Yes, delete' })
        );
        expect(run).toHaveBeenCalledTimes(1);
        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).toBeNull()
        );
    });

    it('Cancel and Escape close it without running the action', async () => {
        const run = vi.fn();
        const first = render(<Host onConfirm={run} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Keep it' }));
        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).toBeNull()
        );
        first.unmount();
        render(<Host onConfirm={run} />);
        fireEvent.keyDown(await screen.findByRole('alertdialog'), {
            key: 'Escape',
        });
        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).toBeNull()
        );
        expect(run).not.toHaveBeenCalled();
    });
});
