import { describe, expect, it } from 'vitest';
import { diagramSchema } from '@/qbase/diagram-convert';
import { DatabaseType } from '@/qbase/diagram-types';
import { defaultDiagramName, emptyDiagram } from '../new-diagram';

describe('emptyDiagram', () => {
    const now = new Date('2025-05-01T10:00:00.000Z');

    it('creates a valid blank diagram of the chosen type', () => {
        const d = emptyDiagram({
            id: 'abc',
            name: 'Billing',
            databaseType: DatabaseType.POSTGRESQL,
            now,
        });
        expect(diagramSchema.safeParse(d).success).toBe(true);
        expect(d).toMatchObject({
            id: 'abc',
            name: 'Billing',
            databaseType: DatabaseType.POSTGRESQL,
            tables: [],
            relationships: [],
            createdAt: now,
            updatedAt: now,
        });
    });

    it('trims the name and falls back when it is blank', () => {
        expect(
            emptyDiagram({
                id: '1',
                name: '  Shop  ',
                databaseType: DatabaseType.MYSQL,
            }).name
        ).toBe('Shop');
        expect(
            emptyDiagram({
                id: '1',
                name: '   ',
                databaseType: DatabaseType.MYSQL,
            }).name
        ).toBe(defaultDiagramName());
    });

    it('gives every diagram its own collections', () => {
        const a = emptyDiagram({
            id: '1',
            name: 'a',
            databaseType: DatabaseType.POSTGRESQL,
        });
        const b = emptyDiagram({
            id: '2',
            name: 'b',
            databaseType: DatabaseType.POSTGRESQL,
        });
        expect(a.tables).not.toBe(b.tables);
    });
});
