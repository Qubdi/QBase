import type { ConnectionRef, DbConnectionInput } from './api';

/**
 * What the browser remembers about where a diagram came from, so re-sync is
 * one click. Passwords are never kept here: a saved connection lives on the
 * server, and an unsaved one asks for its password again.
 */
export interface SyncState {
    dialect: 'postgresql' | 'sqlserver';
    source:
        | { kind: 'saved'; savedConnectionId: string }
        | { kind: 'inline'; connection: Omit<DbConnectionInput, 'password'> };
    /** "schema.table" selection used at import; empty means every table */
    tables: string[];
    schemas: string[];
    /** diagram id -> name at the source, the "stored source identity" */
    sourceKeys: {
        tables: Record<string, string>;
        columns: Record<string, string>;
    };
    lastSyncedAt: string;
}

const KEY = 'qbase.sync-state';

type All = Record<string, SyncState>;

const readAll = (): All => {
    try {
        const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

export const getSyncState = (diagramId: string): SyncState | undefined =>
    readAll()[diagramId];

export const setSyncState = (diagramId: string, state: SyncState) => {
    try {
        localStorage.setItem(
            KEY,
            JSON.stringify({ ...readAll(), [diagramId]: state })
        );
    } catch {
        // storage unavailable: re-sync just will not be one click
    }
};

export const clearSyncState = (diagramId: string) => {
    const all = readAll();
    delete all[diagramId];
    try {
        localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
        // ignore
    }
};

/** The request body for the server; inline connections need the password again. */
export function toConnectionRef(
    state: SyncState,
    password?: string
): ConnectionRef | null {
    if (state.source.kind === 'saved') {
        return {
            savedConnectionId: state.source.savedConnectionId,
            ...(password ? { password } : {}),
        };
    }
    if (!password) return null;
    return { connection: { ...state.source.connection, password } };
}

export const needsPassword = (state: SyncState): boolean =>
    state.source.kind === 'inline';
