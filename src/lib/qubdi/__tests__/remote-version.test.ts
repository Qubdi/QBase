import { beforeEach, describe, expect, it } from 'vitest';
import {
    clearBaseUpdatedAt,
    getBaseUpdatedAt,
    setBaseUpdatedAt,
} from '../remote-version';
import { clearRemoteId, setRemoteId } from '../remote-map';

describe('remote version', () => {
    beforeEach(() => {
        localStorage.clear();
        clearBaseUpdatedAt('d1');
        clearBaseUpdatedAt('d2');
    });

    it('remembers the server copy each local diagram was last in sync with', () => {
        expect(getBaseUpdatedAt('d1')).toBeUndefined();
        setBaseUpdatedAt('d1', '2026-01-01T00:00:00.000Z');
        setBaseUpdatedAt('d2', '2026-02-02T00:00:00.000Z');
        expect(getBaseUpdatedAt('d1')).toBe('2026-01-01T00:00:00.000Z');
        expect(getBaseUpdatedAt('d2')).toBe('2026-02-02T00:00:00.000Z');
    });

    it('survives a reload (it is stored, not only held in memory)', () => {
        setBaseUpdatedAt('d1', '2026-01-01T00:00:00.000Z');
        expect(
            JSON.parse(localStorage.getItem('qbase.remote-version')!)
        ).toEqual({ d1: '2026-01-01T00:00:00.000Z' });
    });

    it('is forgotten when the diagram is unbound from the server', () => {
        setRemoteId('d1', 'r1');
        setBaseUpdatedAt('d1', '2026-01-01T00:00:00.000Z');
        clearRemoteId('d1');
        expect(getBaseUpdatedAt('d1')).toBeUndefined();
    });
});
