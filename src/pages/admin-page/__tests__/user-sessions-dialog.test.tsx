import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AdminSession, type AdminUser } from '@/lib/qubdi/api';
import { UserSessionsDialog } from '../user-sessions-dialog';

const adminListUserSessions = vi.fn();
const adminSignOutUser = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        adminListUserSessions: (...a: unknown[]) => adminListUserSessions(...a),
        adminSignOutUser: (...a: unknown[]) => adminSignOutUser(...a),
    },
}));

const toast = vi.fn();
vi.mock('@/platform/toast/use-toast', () => ({
    useToast: () => ({ toast }),
}));

const user = (id: string, email: string): AdminUser => ({
    id,
    email,
    isAdmin: false,
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    lastLoginAt: null,
    lastActiveAt: null,
    projects: 0,
});
const ann = user('u-ann', 'ann@corp.io');

const CHROME =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const session = (over: Partial<AdminSession> = {}): AdminSession => ({
    createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    lastSeenAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    userAgent: CHROME,
    ...over,
});

const renderDialog = (
    props: Partial<React.ComponentProps<typeof UserSessionsDialog>> = {}
) => {
    const onClose = vi.fn();
    const onSignedOut = vi.fn();
    const view = render(
        <UserSessionsDialog
            user={ann}
            onClose={onClose}
            onSignedOut={onSignedOut}
            {...props}
        />
    );
    return { onClose, onSignedOut, ...view };
};

describe('UserSessionsDialog', () => {
    beforeEach(() => {
        adminListUserSessions.mockReset();
        adminSignOutUser.mockReset();
        toast.mockReset();
        adminListUserSessions.mockResolvedValue([session()]);
        adminSignOutUser.mockResolvedValue({ signedOut: 1 });
    });

    it('says whose sessions these are, and that there is one at a time', async () => {
        renderDialog();
        expect(await screen.findByText(/ann@corp\.io/)).toBeTruthy();
        expect(screen.getByText(/one live session/)).toBeTruthy();
        expect(adminListUserSessions).toHaveBeenCalledWith('u-ann');
    });

    it('shows which browser, when they signed in and when it was last used', async () => {
        renderDialog();
        const list = await screen.findByRole('list', { name: 'Live sessions' });
        const item = within(list).getByRole('listitem');
        expect(item.textContent).toContain('Chrome on Windows');
        expect(item.textContent).toContain('Signed in 2 hours ago');
        expect(item.textContent).toContain('last active 4 minutes ago');
    });

    it('does not pretend to know a browser that did not say', async () => {
        adminListUserSessions.mockResolvedValue([session({ userAgent: null })]);
        renderDialog();
        expect(await screen.findByText('Unknown browser')).toBeTruthy();
    });

    it('says so when they are not signed in, and offers nothing to end', async () => {
        adminListUserSessions.mockResolvedValue([]);
        renderDialog();
        expect(await screen.findByText('Not signed in anywhere.')).toBeTruthy();
        expect(
            (
                screen.getByRole('button', {
                    name: 'Sign out everywhere',
                }) as HTMLButtonElement
            ).disabled
        ).toBe(true);
    });

    it('waits for the list before offering to end anything', async () => {
        adminListUserSessions.mockReturnValue(new Promise(() => undefined));
        renderDialog();
        expect(await screen.findByText('Loading…')).toBeTruthy();
        expect(
            (
                screen.getByRole('button', {
                    name: 'Sign out everywhere',
                }) as HTMLButtonElement
            ).disabled
        ).toBe(true);
    });

    it('signs them out, empties the list, refreshes the page behind and says so', async () => {
        const { onSignedOut } = renderDialog();
        await screen.findByText('Chrome on Windows');

        fireEvent.click(
            screen.getByRole('button', { name: 'Sign out everywhere' })
        );

        await waitFor(() =>
            expect(adminSignOutUser).toHaveBeenCalledWith('u-ann')
        );
        expect(await screen.findByText('Not signed in anywhere.')).toBeTruthy();
        expect(onSignedOut).toHaveBeenCalledTimes(1);
        expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Signed out',
                description: 'ann@corp.io has been signed out everywhere.',
            })
        );
    });

    it('says when there was nobody to sign out (they signed out meanwhile)', async () => {
        adminSignOutUser.mockResolvedValue({ signedOut: 0 });
        renderDialog();
        await screen.findByText('Chrome on Windows');
        fireEvent.click(
            screen.getByRole('button', { name: 'Sign out everywhere' })
        );
        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Already signed out' })
            )
        );
    });

    it('keeps the session on screen and shows why when signing out fails', async () => {
        adminSignOutUser.mockRejectedValue(
            new ApiError(400, 'cannot_sign_out_self')
        );
        const { onSignedOut } = renderDialog();
        await screen.findByText('Chrome on Windows');

        fireEvent.click(
            screen.getByRole('button', { name: 'Sign out everywhere' })
        );

        expect((await screen.findByRole('alert')).textContent).toMatch(
            /cannot sign yourself out/i
        );
        expect(screen.getByText('Chrome on Windows')).toBeTruthy();
        expect(onSignedOut).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
    });

    it('shows why the sessions could not be loaded', async () => {
        adminListUserSessions.mockRejectedValue(new ApiError(404, 'not_found'));
        renderDialog();
        expect((await screen.findByRole('alert')).textContent).toBe(
            'Not found.'
        );
        expect(screen.queryByText('Loading…')).toBeNull();
    });

    it("asks again for another user, and never shows the first one's sessions under the second", async () => {
        adminListUserSessions.mockImplementation(async (id: string) =>
            id === 'u-ann'
                ? [session({ userAgent: CHROME })]
                : [
                      session({
                          userAgent:
                              'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
                      }),
                  ]
        );
        const { rerender, onClose, onSignedOut } = renderDialog();
        await screen.findByText('Chrome on Windows');

        rerender(
            <UserSessionsDialog
                user={user('u-bob', 'bob@corp.io')}
                onClose={onClose}
                onSignedOut={onSignedOut}
            />
        );

        expect(await screen.findByText('Firefox on Linux')).toBeTruthy();
        expect(screen.queryByText('Chrome on Windows')).toBeNull();
        expect(adminListUserSessions).toHaveBeenLastCalledWith('u-bob');
    });

    it('drops a late answer for a user who is no longer the one shown', async () => {
        let answerAnn!: (list: AdminSession[]) => void;
        adminListUserSessions.mockImplementation((id: string) =>
            id === 'u-ann'
                ? new Promise<AdminSession[]>((resolve) => {
                      answerAnn = resolve;
                  })
                : Promise.resolve([session({ userAgent: null })])
        );
        const { rerender, onClose, onSignedOut } = renderDialog();
        rerender(
            <UserSessionsDialog
                user={user('u-bob', 'bob@corp.io')}
                onClose={onClose}
                onSignedOut={onSignedOut}
            />
        );
        await screen.findByText('Unknown browser');

        answerAnn([session({ userAgent: CHROME })]);
        await new Promise((r) => setTimeout(r, 20));

        expect(screen.queryByText('Chrome on Windows')).toBeNull();
        expect(screen.getByText('Unknown browser')).toBeTruthy();
    });

    it('does nothing, and asks for nothing, while no user is chosen', () => {
        renderDialog({ user: null });
        expect(adminListUserSessions).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('closes from the Close button at the bottom, and from the cross in the corner', async () => {
        const { onClose } = renderDialog();
        await screen.findByText('Chrome on Windows');
        // the dialog's own cross is also named "Close"
        const closers = screen.getAllByRole('button', { name: 'Close' });
        expect(closers).toHaveLength(2);
        for (const button of closers) fireEvent.click(button);
        expect(onClose).toHaveBeenCalledTimes(2);
    });
});
