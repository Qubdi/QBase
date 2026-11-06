import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLatestFromServer } from '../get-latest';
import { getRemoteId, setRemoteId } from '../remote-map';
import {
    adoptHandedOffSyncState,
    getSyncState,
    setSyncState,
    type SyncState,
} from '../sync-state';

const assign = vi.fn();

describe('getLatestFromServer', () => {
    beforeEach(() => {
        localStorage.clear();
        assign.mockReset();
        vi.stubGlobal('location', { assign });
    });
    afterEach(() => vi.unstubAllGlobals());

    const args = (over = {}) => ({
        localId: 'local-1',
        remoteId: 'r1',
        projectSlug: 'Qubdi',
        deleteLocal: vi.fn().mockResolvedValue(undefined),
        ...over,
    });

    it('drops this browser copy, then opens the server diagram again', async () => {
        setRemoteId('local-1', 'r1');
        const a = args();
        await getLatestFromServer(a);
        expect(a.deleteLocal).toHaveBeenCalledWith('local-1');
        expect(getRemoteId('local-1')).toBeUndefined();
        expect(assign).toHaveBeenCalledWith('/Qubdi/diagrams/r1');
    });

    it('lets the caller stop pending saves just before the reload', async () => {
        const order: string[] = [];
        assign.mockImplementation(() => order.push('reload'));
        await getLatestFromServer(
            args({
                deleteLocal: async () => void order.push('delete'),
                beforeReload: () => order.push('before'),
            })
        );
        expect(order).toEqual(['delete', 'before', 'reload']);
    });

    it('waits for a save that is already on its way before it reloads', async () => {
        const order: string[] = [];
        assign.mockImplementation(() => order.push('reload'));
        let settle!: () => void;
        const running = new Promise<void>((r) => (settle = r));
        const done = getLatestFromServer(
            args({
                beforeReload: () =>
                    running.then(() => void order.push('saved')),
            })
        );
        await new Promise((r) => setTimeout(r, 10));
        expect(order).toEqual([]);
        settle();
        await done;
        expect(order).toEqual(['saved', 'reload']);
    });

    it('hands the database source on to the copy that will be downloaded', async () => {
        const state: SyncState = {
            dialect: 'postgresql',
            source: { kind: 'saved', savedConnectionId: 'c1' },
            tables: ['public.users'],
            schemas: ['public'],
            sourceKeys: {
                tables: { t1: 'users' },
                columns: { f1: 'users.id' },
            },
            lastSyncedAt: '2026-01-01T00:00:00.000Z',
        };
        setSyncState('local-1', state);
        await getLatestFromServer(args());
        expect(getSyncState('local-1')).toBeUndefined();
        adoptHandedOffSyncState('r1', 'local-2');
        expect(getSyncState('local-2')).toEqual(state);
        // handed on once
        adoptHandedOffSyncState('r1', 'local-3');
        expect(getSyncState('local-3')).toBeUndefined();
    });

    it('hands nothing on for a diagram that has no database source', async () => {
        await getLatestFromServer(args());
        adoptHandedOffSyncState('r1', 'local-2');
        expect(getSyncState('local-2')).toBeUndefined();
    });

    it('keeps the page and the saves when the copy cannot be deleted', async () => {
        const beforeReload = vi.fn();
        await expect(
            getLatestFromServer(
                args({
                    deleteLocal: vi.fn().mockRejectedValue(new Error('nope')),
                    beforeReload,
                })
            )
        ).rejects.toThrow('nope');
        expect(beforeReload).not.toHaveBeenCalled();
        expect(assign).not.toHaveBeenCalled();
    });
});
