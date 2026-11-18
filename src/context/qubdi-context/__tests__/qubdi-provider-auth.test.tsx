import React, { useContext, useEffect } from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/qubdi/api';
import { getBaseUpdatedAt, setBaseUpdatedAt } from '@/lib/qubdi/remote-version';
import { setRemoteId } from '@/lib/qubdi/remote-map';
import type { Diagram } from '@/qbase/diagram-types';
import { qubdiContext, type QubdiContext } from '../qubdi-context';
import { QubdiProvider } from '../qubdi-provider';

vi.mock('@/lib/qubdi/config', () => ({
    QUBDI_BACKEND_URL: 'http://server.test',
    QUBDI_BACKEND_ENABLED: true,
}));

const api = vi.hoisted(() => ({
    me: vi.fn(),
    login: vi.fn(),
    loginMfa: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getDiagram: vi.fn(),
    updateDiagram: vi.fn(),
    createDiagram: vi.fn(),
}));
const session = vi.hoisted(() => ({
    handler: undefined as (() => void) | null | undefined,
}));
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api,
    setSessionEndedHandler: (fn: (() => void) | null) => {
        session.handler = fn;
    },
}));
const local = vi.hoisted(() => ({
    claimLocalData: vi.fn(),
    clearLocalUserData: vi.fn(),
}));
vi.mock('@/lib/qubdi/local-data', () => local);
const saves = vi.hoisted(() => ({
    flushPendingSave: vi.fn(),
    hasUnsavedChanges: vi.fn(),
}));
vi.mock('@/lib/qubdi/save-status-store', () => saves);
const locks = vi.hoisted(() => ({ releaseHeldLocks: vi.fn() }));
vi.mock('@/components/qubdi/use-edit-lock', () => locks);
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/platform/toast/use-toast', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    toast,
}));
vi.mock('@/lib/qubdi/editor-id', () => ({ getEditorId: () => 'tab-1' }));

const ME = { id: 'u1', email: 'a@b.c' };

const held: { ctx?: QubdiContext } = {};
const Grab: React.FC = () => {
    const value = useContext(qubdiContext);
    useEffect(() => {
        held.ctx = value;
    });
    return null;
};
const ctx = () => held.ctx!;

const mount = () =>
    render(
        <QubdiProvider>
            <Grab />
        </QubdiProvider>
    );
const mountSignedIn = async () => {
    const view = mount();
    await waitFor(() => expect(ctx().user).toEqual(ME));
    return view;
};
const mountSignedOut = async () => {
    api.me.mockRejectedValue(new ApiError(401, 'unauthorized'));
    const view = mount();
    await waitFor(() => expect(ctx().user).toBeNull());
    return view;
};

// window.location cannot be spied on directly in happy-dom
const realLocation = window.location;
const location = { reload: vi.fn(), replace: vi.fn() };

beforeEach(() => {
    localStorage.clear();
    held.ctx = undefined;
    Object.values(api).forEach((m) => m.mockReset());
    api.me.mockResolvedValue(ME);
    api.logout.mockResolvedValue(undefined);
    local.claimLocalData.mockReset().mockResolvedValue(false);
    local.clearLocalUserData.mockReset().mockResolvedValue(undefined);
    saves.flushPendingSave.mockReset().mockResolvedValue(undefined);
    saves.hasUnsavedChanges.mockReset().mockReturnValue(false);
    locks.releaseHeldLocks.mockReset().mockResolvedValue(undefined);
    toast.mockReset();
    location.reload.mockReset();
    location.replace.mockReset();
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...realLocation, ...location },
    });
});
afterEach(() => {
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: realLocation,
    });
});

describe('QubdiProvider signing in', () => {
    it('is unknown until the server answers, and then the person', async () => {
        let answer!: (u: typeof ME) => void;
        api.me.mockReturnValue(new Promise((r) => (answer = r)));
        mount();
        expect(ctx().enabled).toBe(true);
        expect(ctx().user).toBeUndefined();
        await act(async () => answer(ME));
        expect(ctx().user).toEqual(ME);
    });

    it('a password sign-in makes the person signed in', async () => {
        await mountSignedOut();
        api.login.mockResolvedValue(ME);
        let result: unknown;
        await act(async () => {
            result = await ctx().login('a@b.c', 'pw');
        });
        expect(api.login).toHaveBeenCalledWith('a@b.c', 'pw');
        expect(result).toBeUndefined();
        expect(ctx().user).toEqual(ME);
    });

    it('a sign-in that needs a second factor hands back the challenge and signs nobody in', async () => {
        await mountSignedOut();
        api.login.mockResolvedValue({ mfaRequired: true, challenge: 'ch-1' });
        let result: unknown;
        await act(async () => {
            result = await ctx().login('a@b.c', 'pw');
        });
        expect(result).toEqual({ mfaChallenge: 'ch-1' });
        expect(ctx().user).toBeNull();
        expect(local.claimLocalData).not.toHaveBeenCalled();
    });

    it('the code then finishes the sign-in', async () => {
        await mountSignedOut();
        api.loginMfa.mockResolvedValue(ME);
        await act(async () => {
            await ctx().loginMfa('ch-1', { code: '123456' } as never);
        });
        expect(api.loginMfa).toHaveBeenCalledWith('ch-1', { code: '123456' });
        expect(ctx().user).toEqual(ME);
    });

    it('a wrong password leaves the person signed out and passes the error on', async () => {
        await mountSignedOut();
        api.login.mockRejectedValue(new ApiError(401, 'invalid_credentials'));
        await act(async () => {
            await expect(ctx().login('a@b.c', 'bad')).rejects.toMatchObject({
                code: 'invalid_credentials',
            });
        });
        expect(ctx().user).toBeNull();
    });

    it('registering signs the new person in, with the setup token when there is one', async () => {
        await mountSignedOut();
        api.register.mockResolvedValue(ME);
        await act(async () => {
            await ctx().register('a@b.c', 'pw', 'setup-1');
        });
        expect(api.register).toHaveBeenCalledWith('a@b.c', 'pw', 'setup-1');
        expect(ctx().user).toEqual(ME);
    });

    it('when the diagrams here belong to someone else, the page reloads instead of showing them', async () => {
        await mountSignedOut();
        local.claimLocalData.mockResolvedValue(true);
        api.login.mockResolvedValue({ id: 'u2', email: 'x@y.z' });
        await act(async () => {
            await ctx().login('x@y.z', 'pw');
        });
        expect(local.claimLocalData).toHaveBeenCalledWith('u2');
        expect(location.reload).toHaveBeenCalledTimes(1);
        expect(ctx().user).toBeNull();
    });

    it('refreshUser reads the person again', async () => {
        await mountSignedIn();
        api.me.mockResolvedValue({ ...ME, email: 'new@b.c' });
        await act(async () => {
            await ctx().refreshUser();
        });
        expect(ctx().user).toEqual({ ...ME, email: 'new@b.c' });
    });
});

describe('QubdiProvider when the server ends the session', () => {
    it('says the session ended and signs the person out', async () => {
        await mountSignedIn();
        expect(ctx().sessionEnded).toBe(false);
        act(() => session.handler!());
        expect(ctx().sessionEnded).toBe(true);
        expect(ctx().user).toBeNull();
    });

    it('says nothing when nobody was signed in', async () => {
        await mountSignedOut();
        act(() => session.handler!());
        expect(ctx().sessionEnded).toBe(false);
    });

    it('signing in again clears the notice', async () => {
        await mountSignedIn();
        act(() => session.handler!());
        api.login.mockResolvedValue(ME);
        await act(async () => {
            await ctx().login('a@b.c', 'pw');
        });
        expect(ctx().sessionEnded).toBe(false);
        expect(ctx().user).toEqual(ME);
    });

    it('stops listening once it is gone', async () => {
        const view = await mountSignedIn();
        expect(session.handler).toBeTypeOf('function');
        view.unmount();
        expect(session.handler).toBeNull();
    });
});

describe('QubdiProvider signing out', () => {
    const signOut = () =>
        act(async () => {
            await ctx().logout();
        });

    it('sends the last edits, gives the locks back, ends the session, deletes the local data and leaves', async () => {
        const order: string[] = [];
        saves.flushPendingSave.mockImplementation(async () => {
            order.push('flush');
        });
        locks.releaseHeldLocks.mockImplementation(async () => {
            order.push('locks');
        });
        api.logout.mockImplementation(async () => {
            order.push('logout');
        });
        local.clearLocalUserData.mockImplementation(async () => {
            order.push('clear');
        });
        await mountSignedIn();
        await signOut();
        expect(order).toEqual(['flush', 'locks', 'logout', 'clear']);
        expect(ctx().user).toBeNull();
        expect(location.replace).toHaveBeenCalledWith('/');
    });

    it('still signs out when the locks cannot be given back', async () => {
        locks.releaseHeldLocks.mockRejectedValue(new Error('offline'));
        await mountSignedIn();
        await signOut();
        expect(api.logout).toHaveBeenCalledTimes(1);
        expect(location.replace).toHaveBeenCalledWith('/');
    });

    it('asks first when some changes are only in this browser; "Stay signed in" keeps everything', async () => {
        saves.hasUnsavedChanges.mockReturnValue(true);
        await mountSignedIn();
        // the sign-out waits for the answer: start it, answer, then finish it
        let pending!: Promise<void>;
        act(() => {
            pending = ctx().logout();
        });
        expect(
            await screen.findByRole('alertdialog', {
                name: 'Sign out with unsaved changes?',
            })
        ).toBeInTheDocument();
        expect(api.logout).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }));
        await act(async () => {
            await pending;
        });
        expect(api.logout).not.toHaveBeenCalled();
        expect(local.clearLocalUserData).not.toHaveBeenCalled();
        expect(ctx().user).toEqual(ME);
        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).toBeNull()
        );
    });

    it('"Sign out anyway" goes on and deletes the local copy', async () => {
        saves.hasUnsavedChanges.mockReturnValue(true);
        await mountSignedIn();
        // the sign-out waits for the answer: start it, answer, then finish it
        let pending!: Promise<void>;
        act(() => {
            pending = ctx().logout();
        });
        fireEvent.click(
            await screen.findByRole('button', { name: 'Sign out anyway' })
        );
        await act(async () => {
            await pending;
        });
        expect(api.logout).toHaveBeenCalledTimes(1);
        expect(local.clearLocalUserData).toHaveBeenCalledTimes(1);
        expect(ctx().user).toBeNull();
    });
});

describe('QubdiProvider syncDiagram', () => {
    const diagram = {
        id: 'local-9',
        name: 'Shop',
        databaseType: 'postgresql',
        tables: [],
        relationships: [],
        createdAt: new Date(0),
        updatedAt: new Date(0),
    } as unknown as Diagram;

    it('a copy without a conflict base takes the server one first', async () => {
        await mountSignedIn();
        setRemoteId('local-9', 'remote-9');
        api.getDiagram.mockResolvedValue({ updatedAt: 'v3' });
        api.updateDiagram.mockResolvedValue({
            id: 'remote-9',
            updatedAt: 'v4',
        });
        let id: string | undefined;
        await act(async () => {
            id = await ctx().syncDiagram(diagram);
        });
        expect(id).toBe('remote-9');
        expect(api.getDiagram).toHaveBeenCalledWith('remote-9');
        expect(api.updateDiagram.mock.calls[0][1]).toMatchObject({
            baseUpdatedAt: 'v3',
            editorId: 'tab-1',
        });
        expect(getBaseUpdatedAt('local-9')).toBe('v4');
        expect(ctx().remoteIdFor('local-9')).toBe('remote-9');
    });

    it('passes on errors other than "gone", even with a project', async () => {
        await mountSignedIn();
        setRemoteId('local-9', 'remote-9');
        setBaseUpdatedAt('local-9', 'v1');
        api.updateDiagram.mockRejectedValue(new ApiError(409, 'conflict'));
        await act(async () => {
            await expect(
                ctx().syncDiagram(diagram, 'p1')
            ).rejects.toMatchObject({ status: 409 });
        });
        expect(api.createDiagram).not.toHaveBeenCalled();
    });

    it('creates a new diagram in the project when there is none on the server yet', async () => {
        await mountSignedIn();
        api.createDiagram.mockResolvedValue({ id: 'new-1', updatedAt: 'v1' });
        let id: string | undefined;
        await act(async () => {
            id = await ctx().syncDiagram(diagram, 'p1');
        });
        expect(id).toBe('new-1');
        expect(ctx().remoteIdFor('local-9')).toBe('new-1');
        expect(getBaseUpdatedAt('local-9')).toBe('v1');
    });
});
