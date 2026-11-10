import { useEffect, useState } from 'react';
import type { LockState } from '@/lib/qubdi/access';
import { api } from '@/lib/qubdi/api';
import { getEditorId } from '@/lib/qubdi/editor-id';
import { settleFinalSave } from '@/lib/qubdi/save-status-store';
import { onLockLost } from '@/lib/qubdi/lock-lost';

/** How often the open editor renews its lock; the server's lasts 90 seconds. */
export const LOCK_HEARTBEAT_MS = 20_000;

const CHECKING: LockState = { status: 'checking' };

// The editor open on each diagram. A grant that arrives after its editor left
// is given back, unless another editor has opened the same diagram since (the
// lock is per tab, so giving it back would take it from that one).
const openEditors = new Map<string, symbol>();

// Gives back the lock of each open editor that holds one (see releaseHeldLocks).
const holders = new Map<symbol, () => Promise<void>>();

/**
 * Lets go of every edit lock this tab holds and waits for the server to know.
 * Sign-out calls it before the session ends: the editor's own release runs
 * only when it unmounts, after the session is gone, and the server answered
 * that with a 401 (found in a real-browser run).
 */
export async function releaseHeldLocks(): Promise<void> {
    await Promise.all([...holders.values()].map((give) => give()));
}

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

    // asking for another diagram's lock starts from 'checking': reset while
    // rendering, not in the effect that asks
    const [lockFor, setLockFor] = useState(remoteId);
    if (lockFor !== remoteId) {
        setLockFor(remoteId);
        if (remoteId) setLock(CHECKING);
    }

    useEffect(() => {
        if (!remoteId) return;
        const editorId = getEditorId();
        const me = Symbol(remoteId);
        openEditors.set(remoteId, me);
        let cancelled = false;
        let held = false;
        let timer: ReturnType<typeof setInterval> | undefined;

        const ask = async () => {
            try {
                const res = await api.acquireLock(remoteId, editorId);
                if (cancelled) {
                    // granted after the editor left: nobody would ever release it
                    if (res.held && !openEditors.has(remoteId)) sendRelease();
                    return;
                }
                held = res.held;
                if (res.held) {
                    holders.set(me, giveBack);
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

        const sendRelease = () =>
            api
                .releaseLock(remoteId, editorId, { keepalive: true })
                .catch(() => undefined);

        const giveBack = async () => {
            if (!held) return;
            held = false;
            await settleFinalSave();
            await sendRelease();
        };

        const release = () => {
            if (!held) return;
            held = false;
            // after the final save, which would otherwise take the lock back
            void settleFinalSave().then(sendRelease);
        };

        // The tab is closing: nothing runs after this handler, so a release that
        // waited for the final save to settle might never be sent. The autosaver
        // listens for the same event, and was registered first (it is deeper in
        // the tree), so its final save is already on the wire; send ours right
        // behind it, in this same turn.
        const releaseNow = () => {
            if (!held) return;
            held = false;
            void sendRelease();
        };

        // a save was refused with 423: the lock is someone else's now
        const stopListening = onLockLost((lostId) => {
            if (lostId !== remoteId) return;
            held = false;
            clearInterval(timer);
            setLock({ status: 'taken', holder: null });
        });

        void ask().then(() => {
            if (!cancelled && held) {
                timer = setInterval(() => void ask(), LOCK_HEARTBEAT_MS);
            }
        });
        // the tab closing does not unmount anything
        window.addEventListener('pagehide', releaseNow);
        return () => {
            cancelled = true;
            if (openEditors.get(remoteId) === me) openEditors.delete(remoteId);
            holders.delete(me);
            stopListening();
            clearInterval(timer);
            window.removeEventListener('pagehide', releaseNow);
            release();
        };
    }, [remoteId]);

    return remoteId ? lock : CHECKING;
}
