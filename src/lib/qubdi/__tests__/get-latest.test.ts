import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLatestFromServer } from '../get-latest';
import { getRemoteId, setRemoteId } from '../remote-map';

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
