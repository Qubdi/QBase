import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerFinalFlush } from '@/lib/qubdi/save-status-store';
import { reportLockLost } from '@/lib/qubdi/lock-lost';
import { LOCK_HEARTBEAT_MS, useEditLock } from '../use-edit-lock';

const acquire = vi.fn();
const release = vi.fn();
vi.mock('@/lib/qubdi/api', () => ({
    api: {
        acquireLock: (...a: unknown[]) => acquire(...a),
        releaseLock: (...a: unknown[]) => release(...a),
    },
}));
vi.mock('@/lib/qubdi/editor-id', () => ({ getEditorId: () => 'tab-1' }));

const held = { held: true };
const takenBy = (holder: string) => ({ held: false, holder });

/** lets pending promises settle, then moves the clock */
const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('useEditLock', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        acquire.mockReset();
        release.mockReset().mockResolvedValue(undefined);
    });
    afterEach(() => vi.useRealTimers());

    it('waits for the server before saying anything', async () => {
        acquire.mockResolvedValue(held);
        const { result } = renderHook(() => useEditLock('r1'));
        expect(result.current).toEqual({ status: 'checking' });
        await tick();
        expect(result.current).toEqual({ status: 'held' });
        expect(acquire).toHaveBeenCalledWith('r1', 'tab-1');
    });

    it('says who is editing when the lock is taken', async () => {
        acquire.mockResolvedValue(takenBy('sam@corp.io'));
        const { result } = renderHook(() => useEditLock('r1'));
        await tick();
        expect(result.current).toEqual({
            status: 'taken',
            holder: 'sam@corp.io',
        });
    });

    it('does nothing without a server diagram', async () => {
        const { result } = renderHook(() => useEditLock(undefined));
        await tick(LOCK_HEARTBEAT_MS * 3);
        expect(result.current).toEqual({ status: 'checking' });
        expect(acquire).not.toHaveBeenCalled();
    });

    describe('holding the lock', () => {
        it('renews it on a heartbeat', async () => {
            acquire.mockResolvedValue(held);
            renderHook(() => useEditLock('r1'));
            await tick();
            expect(acquire).toHaveBeenCalledTimes(1);
            await tick(LOCK_HEARTBEAT_MS);
            expect(acquire).toHaveBeenCalledTimes(2);
            await tick(LOCK_HEARTBEAT_MS * 2);
            expect(acquire).toHaveBeenCalledTimes(4);
        });

        it('goes read-only when a save is refused because the lock is lost', async () => {
            acquire.mockResolvedValue(held);
            const { result } = renderHook(() => useEditLock('r1'));
            await tick();
            act(() => reportLockLost('r1'));
            expect(result.current).toEqual({ status: 'taken', holder: null });
            // it stops renewing, so it never takes the lock back quietly
            await tick(LOCK_HEARTBEAT_MS * 2);
            expect(acquire).toHaveBeenCalledTimes(1);
        });

        it('gives way as soon as a renewal finds someone else has it', async () => {
            acquire.mockResolvedValueOnce(held);
            acquire.mockResolvedValue(takenBy('sam@corp.io'));
            const { result } = renderHook(() => useEditLock('r1'));
            await tick();
            expect(result.current.status).toBe('held');
            await tick(LOCK_HEARTBEAT_MS);
            expect(result.current).toEqual({
                status: 'taken',
                holder: 'sam@corp.io',
            });
        });

        it('stops renewing once it lost the lock, so it never takes it back quietly', async () => {
            acquire.mockResolvedValueOnce(held);
            acquire.mockResolvedValue(takenBy('sam@corp.io'));
            renderHook(() => useEditLock('r1'));
            await tick();
            await tick(LOCK_HEARTBEAT_MS);
            const calls = acquire.mock.calls.length;
            await tick(LOCK_HEARTBEAT_MS * 5);
            expect(acquire).toHaveBeenCalledTimes(calls);
        });

        it('keeps the lock through a hiccup in the connection', async () => {
            acquire.mockResolvedValueOnce(held);
            acquire.mockRejectedValueOnce(new Error('offline'));
            acquire.mockResolvedValue(held);
            const { result } = renderHook(() => useEditLock('r1'));
            await tick();
            await tick(LOCK_HEARTBEAT_MS);
            expect(result.current).toEqual({ status: 'held' });
            await tick(LOCK_HEARTBEAT_MS);
            expect(result.current).toEqual({ status: 'held' });
        });

        it('lets go when the editor closes', async () => {
            acquire.mockResolvedValue(held);
            const { unmount } = renderHook(() => useEditLock('r1'));
            await tick();
            unmount();
            await tick();
            expect(release).toHaveBeenCalledWith('r1', 'tab-1', {
                keepalive: true,
            });
            await tick(LOCK_HEARTBEAT_MS * 3);
            expect(acquire).toHaveBeenCalledTimes(1);
        });

        it('lets go when the tab closes, which unmounts nothing', async () => {
            acquire.mockResolvedValue(held);
            renderHook(() => useEditLock('r1'));
            await tick();
            window.dispatchEvent(new Event('pagehide'));
            await tick();
            expect(release).toHaveBeenCalledTimes(1);
            window.dispatchEvent(new Event('pagehide'));
            await tick();
            expect(release).toHaveBeenCalledTimes(1);
        });

        it('lets go only after the final save has settled', async () => {
            acquire.mockResolvedValue(held);
            let finish!: () => void;
            const flush = vi.fn(
                () => new Promise<void>((resolve) => (finish = resolve))
            );
            registerFinalFlush(flush);
            renderHook(() => useEditLock('r1'));
            await tick();
            window.dispatchEvent(new Event('pagehide'));
            await tick();
            expect(flush).toHaveBeenCalledTimes(1);
            expect(release).not.toHaveBeenCalled();
            finish();
            await tick();
            expect(release).toHaveBeenCalledTimes(1);
            registerFinalFlush(null);
        });
    });

    it('does not release a lock it never had', async () => {
        acquire.mockResolvedValue(takenBy('sam@corp.io'));
        const { unmount } = renderHook(() => useEditLock('r1'));
        await tick();
        unmount();
        expect(release).not.toHaveBeenCalled();
    });

    it('reports an unreachable server when the very first ask fails', async () => {
        acquire.mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => useEditLock('r1'));
        await tick();
        expect(result.current).toEqual({ status: 'unreachable' });
    });

    it('starts over for another diagram', async () => {
        acquire.mockResolvedValueOnce(held);
        acquire.mockResolvedValueOnce(takenBy('sam@corp.io'));
        const { result, rerender } = renderHook(
            ({ id }: { id: string }) => useEditLock(id),
            { initialProps: { id: 'r1' } }
        );
        await tick();
        expect(result.current.status).toBe('held');
        rerender({ id: 'r2' });
        expect(result.current).toEqual({ status: 'checking' });
        await tick();
        expect(release).toHaveBeenCalledWith('r1', 'tab-1', {
            keepalive: true,
        });
        expect(result.current).toEqual({
            status: 'taken',
            holder: 'sam@corp.io',
        });
    });
});
