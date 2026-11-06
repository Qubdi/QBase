import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ApiError,
    type DriftBadge,
    type DriftOverview,
    type DriftSettings,
} from '../api';
import { checkDriftOnOpen } from '../auto-drift';

const getDrift = vi.fn();
const checkDrift = vi.fn();
vi.mock('../api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        getDrift: (...a: unknown[]) => getDrift(...a),
        checkDrift: (...a: unknown[]) => checkDrift(...a),
    },
}));

const settings = (connectionId: string | null): DriftSettings => ({
    connectionId,
    schemas: [],
    tables: [],
    sourceKeys: { tables: {}, columns: {} },
    webhookUrl: null,
});

const overview = (over: Partial<DriftOverview> = {}): DriftOverview => ({
    settings: settings('c1'),
    latest: null,
    badge: null,
    ...over,
});

const badge: DriftBadge = {
    status: 'drifted',
    counts: { breaking: 1, warning: 0, info: 0 },
    reportId: 'rep1',
};

describe('checkDriftOnOpen', () => {
    beforeEach(() => {
        getDrift.mockReset().mockResolvedValue(overview());
        checkDrift.mockReset().mockResolvedValue({ badge: null });
    });

    it('checks the database and shows the badge the check answers with', async () => {
        const order: string[] = [];
        getDrift.mockImplementation(async () => {
            order.push('settings');
            return overview();
        });
        checkDrift.mockImplementation(async () => {
            order.push('check');
            return { badge };
        });

        expect(await checkDriftOnOpen('r1')).toEqual(badge);
        // no read after the check: the answer already carries the badge
        expect(order).toEqual(['settings', 'check']);
    });

    it('lets the server hand back a recent report instead of reading the database', async () => {
        await checkDriftOnOpen('r1');
        expect(checkDrift).toHaveBeenCalledWith('r1', { cached: true });
    });

    it('is a clean badge when the database matches', async () => {
        expect(await checkDriftOnOpen('r1')).toBeNull();
    });

    it.each([
        ['has never been configured', null],
        ['has no saved connection', settings(null)],
    ])('does not check a diagram that %s', async (_, s) => {
        getDrift.mockResolvedValue(overview({ settings: s }));
        expect(await checkDriftOnOpen('r1')).toBeUndefined();
        expect(checkDrift).not.toHaveBeenCalled();
    });

    it('stays quiet for someone who cannot see drift', async () => {
        getDrift.mockRejectedValue(new ApiError(403, 'forbidden'));
        expect(await checkDriftOnOpen('r1')).toBeUndefined();
        expect(checkDrift).not.toHaveBeenCalled();
    });

    it('stays quiet when a check is already running', async () => {
        checkDrift.mockRejectedValue(new ApiError(409, 'already_running'));
        expect(await checkDriftOnOpen('r1')).toBeUndefined();
        expect(getDrift).toHaveBeenCalledTimes(1);
    });
});
