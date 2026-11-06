import { describe, expect, it } from 'vitest';
import { diagramToServerContent } from '../content';
import { DatabaseType } from '@/lib/domain/database-type';
import type { Diagram } from '@/lib/domain/diagram';

const diagram: Diagram = {
    id: 'local-diagram',
    name: 'Shop',
    databaseType: DatabaseType.POSTGRESQL,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    tables: [
        {
            id: 'tbl_abc',
            name: 'users',
            x: 10,
            y: 20,
            color: '#fff',
            isView: false,
            createdAt: 1,
            indexes: [],
            fields: [
                {
                    id: 'fld_xyz',
                    name: 'id',
                    type: { id: 'bigint', name: 'bigint' },
                    primaryKey: true,
                    unique: true,
                    nullable: false,
                    createdAt: 1,
                },
            ],
        },
    ],
    relationships: [
        {
            id: 'rel_1',
            name: 'fk',
            sourceTableId: 'tbl_abc',
            targetTableId: 'tbl_abc',
            sourceFieldId: 'fld_xyz',
            targetFieldId: 'fld_xyz',
            sourceCardinality: 'many',
            targetCardinality: 'one',
            createdAt: 1,
        },
    ],
};

describe('diagramToServerContent', () => {
    it('keeps table, field and relationship ids untouched', () => {
        const out = diagramToServerContent(diagram) as unknown as Diagram;
        expect(out.id).toBe('local-diagram');
        expect(out.tables?.[0].id).toBe('tbl_abc');
        expect(out.tables?.[0].fields[0].id).toBe('fld_xyz');
        expect(out.relationships?.[0].id).toBe('rel_1');
        expect(out.relationships?.[0].sourceTableId).toBe('tbl_abc');
    });

    it('serializes dates as ISO strings and keeps layout data', () => {
        const out = diagramToServerContent(diagram) as Record<string, unknown>;
        expect(out.createdAt).toBe('2026-01-01T00:00:00.000Z');
        const table = (out.tables as Array<Record<string, unknown>>)[0];
        expect(table).toMatchObject({ x: 10, y: 20, color: '#fff' });
    });

    it('does not mutate the original diagram', () => {
        const before = JSON.stringify(diagram);
        diagramToServerContent(diagram);
        expect(JSON.stringify(diagram)).toBe(before);
        expect(diagram.createdAt).toBeInstanceOf(Date);
    });
});
