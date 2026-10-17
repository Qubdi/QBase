import { describe, expect, it } from 'vitest';
import { DatabaseType } from '@/lib/domain/database-type';
import { determineCardinality } from '../common';
import { sqlImportToDiagram } from '../index';

describe('cardinality of imported foreign keys', () => {
    describe('determineCardinality', () => {
        it('reads a foreign key as many to one when only the referenced column is unique', () => {
            expect(determineCardinality(false, true)).toEqual({
                sourceCardinality: 'many',
                targetCardinality: 'one',
            });
        });

        it('never answers many to many: a foreign key points at one row', () => {
            // neither column is marked unique
            expect(determineCardinality(false, false)).toEqual({
                sourceCardinality: 'many',
                targetCardinality: 'one',
            });
        });

        it('keeps one to one when both are unique', () => {
            expect(determineCardinality(true, true)).toEqual({
                sourceCardinality: 'one',
                targetCardinality: 'one',
            });
        });
    });

    describe('a foreign key to a column that is not marked unique', () => {
        it('is still one to many, with the referenced table as the one', async () => {
            const diagram = await sqlImportToDiagram({
                sqlContent: `
                    CREATE TABLE parent (code TEXT);
                    CREATE TABLE child (
                        id INTEGER PRIMARY KEY,
                        parent_code TEXT,
                        FOREIGN KEY (parent_code) REFERENCES parent(code)
                    );
                `,
                sourceDatabaseType: DatabaseType.SQLITE,
                targetDatabaseType: DatabaseType.SQLITE,
            });

            expect(diagram.relationships).toHaveLength(1);
            const [rel] = diagram.relationships!;
            const tableName = (id: string) =>
                diagram.tables?.find((t) => t.id === id)?.name;
            expect(tableName(rel.sourceTableId)).toBe('parent');
            expect(tableName(rel.targetTableId)).toBe('child');
            expect(rel.sourceCardinality).toBe('one');
            expect(rel.targetCardinality).toBe('many');
        });
    });
});
