// The editor's edit lock is gone: a save the server refused because another
// editor holds it (423), or the holder agreeing to step out when asked. The
// edit lock itself lives in `useEditLock`; this tells it the lock is gone so
// the editor goes read-only instead of retrying the save for ever.
type Listener = (remoteId: string, holder?: string) => void;

const listeners = new Set<Listener>();

/** `holder` is who has the diagram now, when it is known. */
export const reportLockLost = (remoteId: string, holder?: string) => {
    listeners.forEach((listener) => listener(remoteId, holder));
};

export const onLockLost = (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
};
