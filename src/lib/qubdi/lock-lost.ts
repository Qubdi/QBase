// A save the server refused because another editor holds the lock (423). The
// edit lock itself lives in `useEditLock`; this tells it the lock is gone so
// the editor goes read-only instead of retrying the save for ever.
type Listener = (remoteId: string) => void;

const listeners = new Set<Listener>();

export const reportLockLost = (remoteId: string) => {
    listeners.forEach((listener) => listener(remoteId));
};

export const onLockLost = (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
};
