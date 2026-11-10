import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { usePasswordMinLength as UsePasswordMinLength } from '../use-password-min-length';

const { setupStatus } = vi.hoisted(() => ({ setupStatus: vi.fn() }));

vi.mock('@/lib/qubdi/api', () => ({
    api: { setupStatus: (...a: unknown[]) => setupStatus(...a) },
}));

describe('usePasswordMinLength', () => {
    // the answer is kept for the page load, so each test loads a fresh copy
    let usePasswordMinLength: typeof UsePasswordMinLength;

    beforeEach(async () => {
        setupStatus.mockReset();
        vi.resetModules();
        ({ usePasswordMinLength } = await import('../use-password-min-length'));
    });

    it('starts at the default and takes what the server says', async () => {
        setupStatus.mockResolvedValue({
            needsSetup: false,
            passwordMinLength: 16,
        });
        const { result } = renderHook(() => usePasswordMinLength());
        expect(result.current).toBe(12);
        await waitFor(() => expect(result.current).toBe(16));
    });

    it('asks once per page load, however many forms use it', async () => {
        setupStatus.mockResolvedValue({
            needsSetup: false,
            passwordMinLength: 14,
        });
        const a = renderHook(() => usePasswordMinLength());
        const b = renderHook(() => usePasswordMinLength());
        await waitFor(() => expect(a.result.current).toBe(14));
        await waitFor(() => expect(b.result.current).toBe(14));
        expect(setupStatus).toHaveBeenCalledTimes(1);
    });

    it('does not ask while the form is closed', () => {
        renderHook(() => usePasswordMinLength(false));
        expect(setupStatus).not.toHaveBeenCalled();
    });

    it('keeps the default, and asks again next time, when the server cannot be reached', async () => {
        setupStatus.mockRejectedValueOnce(new Error('offline'));
        const first = renderHook(() => usePasswordMinLength());
        await waitFor(() => expect(setupStatus).toHaveBeenCalledTimes(1));
        expect(first.result.current).toBe(12);

        setupStatus.mockResolvedValue({
            needsSetup: false,
            passwordMinLength: 20,
        });
        const second = renderHook(() => usePasswordMinLength());
        await waitFor(() => expect(second.result.current).toBe(20));
    });

    it('never goes below the floor, whatever the server says', async () => {
        setupStatus.mockResolvedValue({
            needsSetup: false,
            passwordMinLength: 2,
        });
        const { result } = renderHook(() => usePasswordMinLength());
        await waitFor(() => expect(setupStatus).toHaveBeenCalled());
        await waitFor(() => expect(result.current).toBe(8));
    });
});
