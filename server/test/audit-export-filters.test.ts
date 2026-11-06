import { describe, expect, it } from 'vitest';
import { activityQuery } from '../src/audit/activity.js';
import { exportFilters, exportQuery } from '../src/audit/export.js';

describe('exportFilters', () => {
    it('is empty when nothing was filtered', () => {
        expect(exportFilters(exportQuery.parse({}))).toEqual({});
        expect(exportFilters(exportQuery.parse({ saves: 'show' }))).toEqual({});
    });

    it('names each filter that was set, with dates as ISO times', () => {
        const id = '2b0f5c3e-6f43-4d0a-9d8e-0f6f6d7f1a11';
        const q = exportQuery.parse({
            group: 'users',
            action: 'user.update',
            userId: id,
            diagramId: id,
            from: '2026-01-01T00:00:00Z',
            to: '2026-02-01T00:00:00Z',
            saves: 'hide',
        });
        expect(exportFilters(q)).toEqual({
            group: 'users',
            action: 'user.update',
            userId: id,
            diagramId: id,
            from: '2026-01-01T00:00:00.000Z',
            to: '2026-02-01T00:00:00.000Z',
            saves: 'hide',
        });
    });

    it('stays inside the 1 KB audit meta limit with every filter set', () => {
        const id = '2b0f5c3e-6f43-4d0a-9d8e-0f6f6d7f1a11';
        const q = activityQuery
            .omit({ limit: true, cursor: true })
            .parse({
                group: 'checks',
                action: 'x'.repeat(60),
                userId: id,
                diagramId: id,
                from: '2026-01-01T00:00:00Z',
                to: '2026-02-01T00:00:00Z',
                saves: 'hide',
            });
        const meta = JSON.stringify({ rows: 50000, filters: exportFilters(q) });
        expect(Buffer.byteLength(meta)).toBeLessThanOrEqual(1024);
    });
});
