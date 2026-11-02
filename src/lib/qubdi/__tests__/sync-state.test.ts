import { beforeEach, describe, expect, it } from 'vitest';
import {
    clearSyncState,
    getSyncState,
    needsPassword,
    setSyncState,
    toConnectionRef,
    type SyncState,
} from '../sync-state';

const inline: SyncState = {
    dialect: 'postgresql',
    source: {
        kind: 'inline',
        connection: {
            dialect: 'postgresql',
            host: 'db.example.com',
            port: 5432,
            database: 'shop',
            user: 'reader',
            ssl: true,
            trustServerCertificate: false,
        },
    },
    tables: ['public.customers'],
    schemas: ['public'],
    sourceKeys: { tables: { t1: 'public.customers' }, columns: { f1: 'id' } },
    lastSyncedAt: '2026-01-01T00:00:00Z',
};
const saved: SyncState = {
    ...inline,
    source: { kind: 'saved', savedConnectionId: 'c1' },
};

describe('sync state', () => {
    beforeEach(() => localStorage.clear());

    it('stores and reads state per diagram', () => {
        setSyncState('d1', inline);
        setSyncState('d2', saved);
        expect(getSyncState('d1')).toEqual(inline);
        expect(getSyncState('d2')).toEqual(saved);
        expect(getSyncState('nope')).toBeUndefined();
    });

    it('clears one diagram without touching others', () => {
        setSyncState('d1', inline);
        setSyncState('d2', saved);
        clearSyncState('d1');
        expect(getSyncState('d1')).toBeUndefined();
        expect(getSyncState('d2')).toBeDefined();
    });

    it('survives corrupted storage', () => {
        localStorage.setItem('qbase.sync-state', 'not json');
        expect(getSyncState('d1')).toBeUndefined();
        setSyncState('d1', inline);
        expect(getSyncState('d1')).toEqual(inline);
    });

    it('never writes a password into storage', () => {
        setSyncState('d1', inline);
        const raw = localStorage.getItem('qbase.sync-state') ?? '';
        expect(raw.toLowerCase()).not.toContain('password');
    });

    it('builds request bodies: saved connections need no password, inline ones do', () => {
        expect(needsPassword(saved)).toBe(false);
        expect(needsPassword(inline)).toBe(true);
        expect(toConnectionRef(saved)).toEqual({ savedConnectionId: 'c1' });
        expect(toConnectionRef(saved, 'override')).toEqual({
            savedConnectionId: 'c1',
            password: 'override',
        });
        expect(toConnectionRef(inline)).toBeNull();
        expect(toConnectionRef(inline, 'pw')).toEqual({
            connection: {
                ...(inline.source.kind === 'inline'
                    ? inline.source.connection
                    : {}),
                password: 'pw',
            },
        });
    });
});
