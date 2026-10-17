import { useEffect, useState } from 'react';
import type { LockState } from '@/lib/qubdi/access';
import { api } from '@/lib/qubdi/api';
import { getEditorId } from '@/lib/qubdi/editor-id';

/** How often the open editor renews its lock; the server's lasts 90 seconds. */
export const LOCK_HEARTBEAT_MS = 20_000;

const CHECKING: LockState = { status: 'checking' };

/**
 * Holds the edit lock of a server diagram while the editor is open: takes it,
 * renews it, and lets go when the editor leaves. Only one editor at a time may
 * change a diagram; the others open it read-only.
 *
 * Without a `remoteId` there is nothing to lock and the state stays 'checking'.
 * An editor that did not get the lock never asks again by itself: it would
 * start editing a copy that went out of date while it waited.
 */
export function useEditLock(remoteId: string | undefined): LockState {
    const [lock, setLock] = useState<LockState>(CHECKING);

    useEffect(() => {
        if (!remoteId) return;
        const editorId = getEditorId();
        let cancelled = false;
        let held = false;
        let timer: ReturnType<typeof setInterval> | undefined;

        const ask = async () => {
            try {
                const res = await api.acquireLock(remoteId, editorId);
                if (cancelled) return;
                held = res.held;
                if (res.held) {
                    setLock({ status: 'held' });
                } else {
                    // someone else has it: stop renewing, so we never take it quietly
                    clearInterval(timer);
                    setLock({ status: 'taken', holder: res.holder });
                }
            } catch {
                if (cancelled) return;
                // a hiccup while editing keeps the lock; a first failure cannot be told apart
                setLock((prev) =>
                    prev.status === 'checking'
                        ? { status: 'unreachable' }
                        : prev
                );
            }
        };

        const release = () => {
            if (!held) return;
            held = false;
            void api
                .releaseLock(remoteId, editorId, { keepalive: true })
                .catch(() => undefined);
        };

        setLock(CHECKING);
        void ask().then(() => {
            if (!cancelled && held) {
                timer = setInterval(() => void ask(), LOCK_HEARTBEAT_MS);
            }
        });
        // the tab closing does not unmount anything
        window.addEventListener('pagehide', release);
        return () => {
            cancelled = true;
            clearInterval(timer);
            window.removeEventListener('pagehide', release);
            release();
        };
    }, [remoteId]);

    return remoteId ? lock : CHECKING;
}
