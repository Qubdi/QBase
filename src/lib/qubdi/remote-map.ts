// Remembers which server diagram a local (Dexie) diagram is synced to.
// Per-browser convenience only; the server stays the source of truth.
const KEY = 'qubdidb.remote-map';

type RemoteMap = Record<string, string>;

const read = (): RemoteMap => {
    try {
        const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

export const getRemoteId = (localId: string): string | undefined =>
    read()[localId];

export const setRemoteId = (localId: string, remoteId: string) => {
    try {
        localStorage.setItem(
            KEY,
            JSON.stringify({ ...read(), [localId]: remoteId })
        );
    } catch {
        // storage unavailable: sync still works, mapping just is not remembered
    }
};

export const clearRemoteId = (localId: string) => {
    const map = read();
    delete map[localId];
    try {
        localStorage.setItem(KEY, JSON.stringify(map));
    } catch {
        // ignore
    }
};
