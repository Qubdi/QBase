import { describe, expect, it } from 'vitest';
import { listOf } from '@/core/model/collection';
import { cardinalityOf } from '@/formats/shared/cardinality';
import { importSql } from '@/formats/sql/import-sql';

describe('cardinality of imported foreign keys', () => {
    describe('cardinalityOf', () => {
        const yes = { identifiesRow: true };
        const no = { identifiesRow: false };

        it('reads a foreign key as one (referenced) to many (holder) when only the referenced column is unique', () => {
            expect(cardinalityOf(yes, no)).toEqual({
                source: 'one',
                target: 'many',
            });
        });

        it('never answers many to many: a foreign key points at one row', () => {
            // neither column is marked unique
            expect(cardinalityOf(no, no)).toEqual({
                source: 'one',
                target: 'many',
            });
        });

        it('keeps one to one when both are unique', () => {
            expect(cardinalityOf(yes, yes)).toEqual({
                source: 'one',
                target: 'one',
            });
        });
    });

    describe('a foreign key to a column that is not marked unique', () => {
        it('is still one to many, with the referenced table as the one', () => {
            const { design } = importSql(
                `
                    CREATE TABLE parent (code TEXT);
                    CREATE TABLE child (
                        id INTEGER PRIMARY KEY,
                        parent_code TEXT,
                        FOREIGN KEY (parent_code) REFERENCES parent(code)
                    );
                `,
                'sqlite'
            );

            const links = listOf(design!.links);
            expect(links).toHaveLength(1);
            const [link] = links;
            const tableName = (id: string) => design!.entities.byId[id].name;
            expect(tableName(link.sourceEntityId)).toBe('parent');
            expect(tableName(link.targetEntityId)).toBe('child');
            expect(link.sourceCardinality).toBe('one');
            expect(link.targetCardinality).toBe('many');
        });
    });
});
