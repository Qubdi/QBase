import { describe, expect, it } from 'vitest';
import { createRevisionTracker } from '../revision';
import type { Diagram } from '@/lib/domain/diagram';
import { DatabaseType } from '@/lib/domain/database-type';

const base = (): Diagram => ({
    id: 'd1',
    name: 'Shop',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    databaseType: DatabaseType.POSTGRESQL,
    tables: [],
    relationships: [],
    dependencies: [],
    areas: [],
    customTypes: [],
    notes: [],
});

describe('createRevisionTracker', () => {
    it('keeps the number while nothing saved changes', () => {
        const next = createRevisionTracker();
        const d = base();
        const first = next(d);
        expect(next({ ...d })).toBe(first);
        expect(next({ ...d, updatedAt: new Date(5) })).toBe(first);
    });

    it('moves on when a saved part is replaced', () => {
        const next = createRevisionTracker();
        const d = base();
        const first = next(d);
        const renamed = next({ ...d, name: 'Shop 2' });
        const withTable = next({ ...d, name: 'Shop 2', tables: [] });
        expect(renamed).toBeGreaterThan(first);
        expect(withTable).toBeGreaterThan(renamed);
    });

    it('treats every saved part as content', () => {
        const parts = [
            'relationships',
            'dependencies',
            'areas',
            'customTypes',
            'notes',
        ] as const;
        for (const part of parts) {
            const next = createRevisionTracker();
            const d = base();
            const first = next(d);
            expect(next({ ...d, [part]: [] })).toBeGreaterThan(first);
        }
        const next = createRevisionTracker();
        const d = base();
        const first = next(d);
        expect(
            next({ ...d, databaseType: DatabaseType.MYSQL })
        ).toBeGreaterThan(first);
    });
});
