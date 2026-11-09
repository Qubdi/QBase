import React, { useContext, useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/qubdi/api';
import { qubdiContext, type QubdiContext } from '../qubdi-context';
import { QubdiProvider } from '../qubdi-provider';

vi.mock('@/lib/qubdi/config', () => ({
    QUBDI_BACKEND_URL: 'http://server.test',
    QUBDI_BACKEND_ENABLED: true,
}));

const api = vi.hoisted(() => ({ me: vi.fn(), logout: vi.fn() }));
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api,
}));
// what signing out deletes is covered by the sync test; here only whether it runs
const clearLocalUserData = vi.hoisted(() => vi.fn());
vi.mock('@/lib/qubdi/local-data', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    clearLocalUserData,
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/platform/toast/use-toast', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    toast,
}));

const held: { ctx?: QubdiContext } = {};
const Grab: React.FC = () => {
    const value = useContext(qubdiContext);
    useEffect(() => {
        held.ctx = value;
    });
    return null;
};

const signOut = async () => {
    const replace = vi.fn();
    const real = window.location;
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...real, replace, reload: vi.fn() },
    });
    try {
        render(
            <QubdiProvider>
                <Grab />
            </QubdiProvider>
        );
        await waitFor(() => expect(held.ctx!.user).toBeTruthy());
        await act(async () => {
            await held.ctx!.logout();
        });
    } finally {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: real,
        });
    }
    return replace;
};

describe('signing out when the server cannot end the session', () => {
    beforeEach(() => {
        localStorage.clear();
        api.me.mockReset().mockResolvedValue({ id: 'u1', email: 'a@b.c' });
        api.logout.mockReset();
        clearLocalUserData.mockReset().mockResolvedValue(undefined);
        toast.mockReset();
    });

    it('stays signed in, keeps the local data and says so', async () => {
        api.logout.mockRejectedValue(new ApiError(503, 'unavailable'));
        const replace = await signOut();
        expect(clearLocalUserData).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
        expect(held.ctx!.user).toBeTruthy();
        expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Could not sign out. Check your connection and try again.',
            })
        );
    });

    it('signs out when the session was already over', async () => {
        api.logout.mockRejectedValue(new ApiError(401, 'unauthorized'));
        const replace = await signOut();
        expect(clearLocalUserData).toHaveBeenCalledTimes(1);
        expect(replace).toHaveBeenCalledWith('/');
        expect(toast).not.toHaveBeenCalled();
    });
});
