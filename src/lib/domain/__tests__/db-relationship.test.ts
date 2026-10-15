import { describe, expect, it } from 'vitest';
import {
    dbRelationshipSchema,
    determineCardinalities,
    determineRelationshipType,
    normalizeCardinalities,
    type Cardinality,
} from '../db-relationship';
import { diagramSchema } from '../diagram';

const pair = (
    sourceCardinality: Cardinality,
    targetCardinality: Cardinality
) => ({ sourceCardinality, targetCardinality });

const stored = (over: object = {}) => ({
    id: 'r1',
    name: 'fk_orders_customer',
    sourceTableId: 'customers',
    targetTableId: 'orders',
    sourceFieldId: 'customers.id',
    targetFieldId: 'orders.customer_id',
    sourceCardinality: 'one',
    targetCardinality: 'many',
    createdAt: 1,
    ...over,
});

describe('there is no many-to-many relationship', () => {
    describe('normalizeCardinalities', () => {
        it('turns a many-to-many into a foreign key: the referenced table is one, the holder is many', () => {
            expect(normalizeCardinalities(pair('many', 'many'))).toEqual(
                pair('one', 'many')
            );
        });

        it.each([
            ['one', 'one'],
            ['one', 'many'],
            ['many', 'one'],
        ] as const)('leaves %s to %s alone', (s, t) => {
            expect(normalizeCardinalities(pair(s, t))).toEqual(pair(s, t));
        });

        it('keeps everything else on the relationship, and does not change the original', () => {
            const original = { ...stored(), ...pair('many', 'many') };
            const fixed = normalizeCardinalities(original);
            expect(fixed).toEqual({ ...original, sourceCardinality: 'one' });
            expect(original.sourceCardinality).toBe('many');
        });
    });

    describe('relationship types', () => {
        it('offers only the three that exist', () => {
            for (const type of [
                'one_to_one',
                'one_to_many',
                'many_to_one',
            ] as const) {
                expect(
                    determineRelationshipType(determineCardinalities(type))
                ).toBe(type);
            }
        });

        it('reads a leftover many-to-many as one-to-many', () => {
            expect(determineRelationshipType(pair('many', 'many'))).toBe(
                'one_to_many'
            );
        });
    });

    describe('loading a saved relationship', () => {
        it('turns an old many-to-many into a one-to-many', () => {
            const parsed = dbRelationshipSchema.parse(
                stored({ sourceCardinality: 'many', targetCardinality: 'many' })
            );
            expect(parsed.sourceCardinality).toBe('one');
            expect(parsed.targetCardinality).toBe('many');
        });

        it('leaves a normal relationship as it was', () => {
            expect(dbRelationshipSchema.parse(stored())).toEqual(stored());
        });

        it('does the same for the relationships of a whole diagram', () => {
            const diagram = diagramSchema.parse({
                id: 'd',
                name: 'shop',
                databaseType: 'postgresql',
                createdAt: new Date(),
                updatedAt: new Date(),
                relationships: [
                    stored({ id: 'a', sourceCardinality: 'many' }),
                    stored({ id: 'b' }),
                ],
            });
            expect(
                diagram.relationships?.map((r) => [
                    r.sourceCardinality,
                    r.targetCardinality,
                ])
            ).toEqual([
                ['one', 'many'],
                ['one', 'many'],
            ]);
        });
    });
});
