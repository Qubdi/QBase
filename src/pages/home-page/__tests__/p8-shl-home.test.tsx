import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminLandingRedirect } from '@/components/qubdi/admin-landing-redirect';
import { AppShell } from '@/components/qubdi/app-shell';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import type { RemoteUser } from '@/lib/qubdi/api';

vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: { setupStatus: async () => ({ needsSetup: false }) },
}));

const admin: RemoteUser = {
    id: 'a',
    email: 'boss@corp.io',
    isAdmin: true,
    mustChangePassword: false,
};
const member: RemoteUser = {
    id: 'm',
    email: 'sam@corp.io',
    isAdmin: false,
    mustChangePassword: false,
};

const Where: React.FC = () => (
    <div data-testid="where">{useLocation().pathname}</div>
);

const shell = (
    value: Partial<QubdiContext>,
    children: React.ReactNode = <p>content</p>
) =>
    render(
        <MemoryRouter>
            <qubdiContext.Provider
                value={
                    {
                        enabled: true,
                        sessionEnded: false,
                        ...value,
                    } as unknown as QubdiContext
                }
            >
                <AppShell>{children}</AppShell>
                <Where />
            </qubdiContext.Provider>
        </MemoryRouter>
    );

beforeEach(() => sessionStorage.clear());

describe('the page frame (SHL-106, SHL-107)', () => {
    it('SHL-107: a 48 px bar with the logo, and the footer "Powered by Qubdi"', () => {
        const { container } = shell({ user: member });
        const bar = container.querySelector('nav')!;
        expect(bar.className).toContain('h-12');
        expect(bar.querySelector('a[href="/"]')).toBeTruthy();
        expect(screen.getByText('Powered by')).toBeTruthy();
        expect(screen.getByLabelText('Qubdi')).toBeTruthy();
        expect(screen.getByText('content')).toBeTruthy();
    });

    it('SHL-107: an admin gets an Admin button, a member does not', () => {
        const first = shell({ user: admin });
        const button = screen.getByRole('button', { name: 'Admin' });
        fireEvent.click(button);
        expect(screen.getByTestId('where').textContent).toBe('/admin');
        first.unmount();
        shell({ user: member });
        expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull();
    });

    it('SHL-107: the email menu offers Change password and Sign out', async () => {
        const logout = vi.fn(async () => undefined);
        shell({ user: member, logout });
        const trigger = screen.getByRole('button', { name: /sam@corp\.io/ });
        fireEvent.keyDown(trigger, { key: 'Enter' });
        const items = (await screen.findAllByRole('menuitem')).map(
            (i) => i.textContent
        );
        expect(items).toEqual(['Change password', 'Sign out']);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
        expect(logout).toHaveBeenCalled();
    });

    it('SHL-106: signed out shows a sign-in prompt, and the "session ended" notice when the server ended it', async () => {
        const first = shell({ user: null, sessionEnded: false });
        expect(
            await screen.findByRole('button', { name: 'Sign in' })
        ).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.queryByText('content')).toBeNull();
        first.unmount();
        shell({ user: null, sessionEnded: true });
        expect(await screen.findByRole('alert')).toBeTruthy();
    });

    it('SHL-106: without a server the page says it needs one', () => {
        shell({ enabled: false, user: null });
        expect(screen.getByText(/server/i)).toBeTruthy();
    });
});

describe('admins land on the admin panel once per session (SHL-108)', () => {
    const home = (user: RemoteUser | null) =>
        render(
            <MemoryRouter initialEntries={['/']}>
                <qubdiContext.Provider
                    value={{ user } as unknown as QubdiContext}
                >
                    <Routes>
                        <Route
                            path="/"
                            element={
                                <>
                                    <AdminLandingRedirect />
                                    <div>home</div>
                                </>
                            }
                        />
                        <Route path="/admin" element={<div>admin panel</div>} />
                    </Routes>
                </qubdiContext.Provider>
            </MemoryRouter>
        );

    it('the first visit goes to /admin, the second in the same session stays', async () => {
        const first = home(admin);
        expect(await screen.findByText('admin panel')).toBeTruthy();
        first.unmount();
        home(admin);
        await waitFor(() => expect(screen.getByText('home')).toBeTruthy());
        expect(screen.queryByText('admin panel')).toBeNull();
    });

    it('a member stays on the home page', async () => {
        home(member);
        expect(await screen.findByText('home')).toBeTruthy();
    });
});
