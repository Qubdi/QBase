import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import type { AccessState } from '@/lib/qubdi/access';
import type { MyProject, RemoteUser } from '@/lib/qubdi/api';
import { AccountMenu } from '../account-menu';
import { DiagramAccessContext } from '../diagram-access-context';
import { WorkspaceContext } from '../workspace-context';

vi.mock('@/qbase/use-diagram', () => ({
    useDiagram: () => ({ currentDiagram: { id: 'd1', name: 'Shop' } }),
}));
const mfa = vi.hoisted(() => ({ available: false }));
vi.mock('@/hooks/use-mfa-available', () => ({
    useMfaAvailable: () => mfa.available,
}));
// the dialogs are their own features; the menu only opens them
vi.mock('../auth-dialog', () => ({ AuthDialog: () => null }));
vi.mock('../change-password-dialog', () => ({
    ChangePasswordDialog: () => null,
}));
vi.mock('../connections-dialog', () => ({ ConnectionsDialog: () => null }));
vi.mock('../members-dialog', () => ({ MembersDialog: () => null }));
vi.mock('../resync-dialog', () => ({ ResyncDialog: () => null }));
vi.mock('../share-dialog', () => ({ ShareDialog: () => null }));
vi.mock('../two-factor-dialog', () => ({ TwoFactorDialog: () => null }));

const Where: React.FC = () => (
    <div data-testid="where">{useLocation().pathname}</div>
);

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
const project = (role: MyProject['role']) =>
    ({ id: 'p1', name: 'Billing', slug: 'billing', role }) as MyProject;

const show = (
    user: RemoteUser | null,
    {
        role = 'editor' as MyProject['role'],
        access = {
            status: 'editor',
            projectId: 'p1',
            remoteId: 'r',
        } as AccessState,
        enabled = true,
    } = {}
) =>
    render(
        <MemoryRouter initialEntries={['/billing/diagrams/r']}>
            <qubdiContext.Provider
                value={
                    {
                        enabled,
                        user,
                        logout: vi.fn(),
                        syncDiagram: vi.fn(),
                        remoteIdFor: () => 'r',
                    } as unknown as QubdiContext
                }
            >
                <WorkspaceContext.Provider
                    value={{
                        project: project(role),
                        localDiagramId: 'd1',
                        remoteDiagramId: 'r',
                    }}
                >
                    <DiagramAccessContext.Provider
                        value={{ access, refresh: () => undefined }}
                    >
                        <AccountMenu />
                        <Where />
                    </DiagramAccessContext.Provider>
                </WorkspaceContext.Provider>
            </qubdiContext.Provider>
        </MemoryRouter>
    );

const items = async (email: string) => {
    fireEvent.keyDown(
        screen.getByRole('button', {
            name: new RegExp(email.replace('.', '\\.')),
        }),
        {
            key: 'Enter',
        }
    );
    return (await screen.findAllByRole('menuitem')).map((i) => i.textContent);
};

describe('account menu (SHL-114)', () => {
    it('signed out it shows only a Sign in button', () => {
        show(null);
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull();
    });

    it('shows nothing without a server', () => {
        const { container } = show(member, { enabled: false });
        expect(container.textContent).toBe('/billing/diagrams/r');
    });

    it('a member who edits: Projects, connections, re-sync, share, members, password, sign out', async () => {
        show(member);
        expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull();
        expect(await items('sam@corp.io')).toEqual([
            'Projects',
            'Database connections',
            'Re-sync from database',
            'Share',
            'Members',
            'Change password',
            'Sign out',
        ]);
    });

    it('an admin also gets an Admin button and an Admin panel item', async () => {
        show(admin);
        const button = screen.getByRole('button', { name: 'Admin' });
        expect(await items('boss@corp.io')).toContain('Admin panel');
        fireEvent.keyDown(document.body, { key: 'Escape' });
        fireEvent.click(button);
        expect(screen.getByTestId('where').textContent).toBe('/admin');
    });

    it('Re-sync and Share are hidden while the diagram is read-only', async () => {
        show(member, {
            access: { status: 'viewer', projectId: 'p1', remoteId: 'r' },
        });
        const names = await items('sam@corp.io');
        expect(names).not.toContain('Re-sync from database');
        expect(names).not.toContain('Share');
        expect(names).toContain('Members');
    });

    it('database connections are not offered to a viewer of the project', async () => {
        show(member, {
            role: 'viewer',
            access: { status: 'viewer', projectId: 'p1', remoteId: 'r' },
        });
        expect(await items('sam@corp.io')).not.toContain(
            'Database connections'
        );
    });

    it('two-factor shows only when the server supports it or the account has it on', async () => {
        mfa.available = false;
        const first = show(member);
        expect(await items('sam@corp.io')).not.toContain(
            'Two-factor authentication'
        );
        first.unmount();
        mfa.available = true;
        show(member);
        expect(await items('sam@corp.io')).toContain(
            'Two-factor authentication'
        );
        mfa.available = false;
    });

    it('Projects goes to the project list', async () => {
        show(member);
        await items('sam@corp.io');
        fireEvent.click(screen.getByRole('menuitem', { name: 'Projects' }));
        expect(screen.getByTestId('where').textContent).toBe('/');
    });
});
