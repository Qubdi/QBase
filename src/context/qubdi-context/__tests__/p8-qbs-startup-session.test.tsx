import React, { useContext, useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/qubdi/api';
import { qubdiContext, type QubdiContext } from '../qubdi-context';
import { QubdiProvider } from '../qubdi-provider';

vi.mock('@/lib/qubdi/config', () => ({
    QUBDI_BACKEND_URL: 'http://server.test',
    QUBDI_BACKEND_ENABLED: true,
}));
const api = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api,
}));

const held: { ctx?: QubdiContext } = {};
const Grab: React.FC = () => {
    const value = useContext(qubdiContext);
    useEffect(() => {
        held.ctx = value;
    });
    return null;
};
const start = async () => {
    render(
        <QubdiProvider>
            <Grab />
        </QubdiProvider>
    );
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
};
const later = (ms: number) =>
    act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe('looking for the session when the app starts', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        api.me.mockReset();
    });
    afterEach(() => vi.useRealTimers());

    it('treats a refusal from the server as signed out, at once', async () => {
        api.me.mockRejectedValue(new ApiError(401, 'unauthorized'));
        await start();
        expect(held.ctx!.user).toBeNull();
        expect(api.me).toHaveBeenCalledTimes(1);
    });

    it('does not show a signed-out user for a server error: it asks again', async () => {
        api.me
            .mockRejectedValueOnce(new ApiError(503, 'unavailable'))
            .mockRejectedValueOnce(new TypeError('network'))
            .mockResolvedValue({ id: 'u1', email: 'a@b.c' });
        await start();
        expect(held.ctx!.user).not.toBeNull();
        expect(held.ctx!.user).toBeUndefined();
        await later(1000);
        expect(held.ctx!.user).toBeUndefined();
        await later(2000);
        expect(held.ctx!.user).toMatchObject({ id: 'u1' });
        expect(api.me).toHaveBeenCalledTimes(3);
    });

    it('gives up and shows the sign-in once the server stays down', async () => {
        api.me.mockRejectedValue(new ApiError(503, 'unavailable'));
        await start();
        await later(7000);
        expect(held.ctx!.user).toBeNull();
        expect(api.me).toHaveBeenCalledTimes(4);
    });
});
