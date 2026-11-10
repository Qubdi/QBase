import { clearBaseUpdatedAt } from './remote-version';
import { clearSyncedContent } from './sent-content';
import { readJsonMap } from './local-map';
import { clearSyncState } from './sync-state';

// Remembers which server diagram a local (Dexie) diagram is synced to.
// Per-browser convenience only; the server stays the source of truth.
const KEY = 'qbase.remote-map';

type RemoteMap = Record<string, string>;

const read = (): RemoteMap => readJsonMap<string>(KEY);

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
    clearBaseUpdatedAt(localId);
    clearSyncedContent(localId);
    // the connection details it remembers must not outlive the binding
    clearSyncState(localId);
    const map = read();
    delete map[localId];
    try {
        localStorage.setItem(KEY, JSON.stringify(map));
        const projects = readProjects();
        delete projects[localId];
        localStorage.setItem(PROJECT_KEY, JSON.stringify(projects));
    } catch {
        // ignore
    }
};

/** The local diagram already synced to a server diagram, if any. */
export const findLocalId = (remoteId: string): string | undefined =>
    Object.entries(read()).find(([, remote]) => remote === remoteId)?.[0];

// Which project a bound local diagram lives in. Also per-browser convenience:
// the server decides access, this only saves a round trip.
const PROJECT_KEY = 'qbase.remote-project';

const readProjects = (): RemoteMap => readJsonMap<string>(PROJECT_KEY);

export const getProjectId = (localId: string): string | undefined =>
    readProjects()[localId];

export const setProjectId = (localId: string, projectId: string) => {
    try {
        localStorage.setItem(
            PROJECT_KEY,
            JSON.stringify({ ...readProjects(), [localId]: projectId })
        );
    } catch {
        // storage unavailable: access is simply looked up again next time
    }
};
