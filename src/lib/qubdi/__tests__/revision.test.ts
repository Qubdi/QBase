import { describe, expect, it } from 'vitest';
import { DatabaseType, type Diagram } from '@/qbase/diagram-types';
import { emptyDiagram } from '../new-diagram';
import { createRevisionTracker } from '../revision';

const diagram = (): Diagram =>
    emptyDiagram({
        id: 'd1',
        name: 'Shop',
        databaseType: DatabaseType.POSTGRESQL,
    });

describe('createRevisionTracker', () => {
    it('starts at 1 and keeps the number for a diagram that did not change', () => {
        const next = createRevisionTracker();
        const d = diagram();
        expect(next(d)).toBe(1);
        expect(next(d)).toBe(1);
        // a new object holding the same parts is no change either
        expect(next({ ...d })).toBe(1);
    });

    it('counts one more for each change to a saved part', () => {
        const next = createRevisionTracker();
        const d = diagram();
        expect(next(d)).toBe(1);
        expect(next({ ...d, name: 'Shop 2' })).toBe(2);
        const renamed = { ...d, name: 'Shop 2' };
        expect(next({ ...renamed, tables: [...(renamed.tables ?? [])] })).toBe(
            3
        );
    });

    it('ignores updatedAt, which moves with every edit', () => {
        const next = createRevisionTracker();
        const d = diagram();
        next(d);
        expect(
            next({ ...d, updatedAt: new Date(d.updatedAt.getTime() + 1) })
        ).toBe(1);
    });

    it('keeps its own count for each tracker', () => {
        const a = createRevisionTracker();
        const b = createRevisionTracker();
        const d = diagram();
        a(d);
        a({ ...d, name: 'x' });
        expect(b(d)).toBe(1);
    });
});
