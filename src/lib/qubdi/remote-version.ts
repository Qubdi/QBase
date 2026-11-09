// The server's `updatedAt` for the copy each local diagram was last in sync
// with. It is sent with every save so the server can tell whether someone else
// saved in between. Kept per browser, like the remote id map.
import { readJsonMap } from './local-map';

const KEY = 'qbase.remote-version';

type Versions = Record<string, string>;

const read = (): Versions => readJsonMap<string>(KEY);

// kept in memory too, so a browser without usable storage still gets the
// protection for the length of the session
const memory: Versions = {};

export const getBaseUpdatedAt = (localId: string): string | undefined =>
    memory[localId] ?? read()[localId];

export const setBaseUpdatedAt = (localId: string, updatedAt: string) => {
    memory[localId] = updatedAt;
    try {
        localStorage.setItem(
            KEY,
            JSON.stringify({ ...read(), [localId]: updatedAt })
        );
    } catch {
        // storage unavailable: the in-memory copy is used
    }
};

export const clearBaseUpdatedAt = (localId: string) => {
    delete memory[localId];
    try {
        const all = read();
        delete all[localId];
        localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
        // ignore
    }
};
