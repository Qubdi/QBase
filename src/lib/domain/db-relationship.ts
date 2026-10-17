import { z } from 'zod';

export interface DBRelationship {
    id: string;
    name: string;
    sourceSchema?: string | null;
    sourceTableId: string;
    targetSchema?: string | null;
    targetTableId: string;
    sourceFieldId: string;
    targetFieldId: string;
    sourceCardinality: Cardinality;
    targetCardinality: Cardinality;
    createdAt: number;
}

export type Cardinality = 'one' | 'many';

/**
 * There is no many-to-many relationship: a relationship is a foreign key, and
 * a foreign key points at one row. A many-to-many is modelled with a junction
 * table. Anything that would come out many-to-many (a reference to part of a
 * composite key, or to a column not marked unique) is still a foreign key, so
 * it is stored as one (the referenced table, `source`) to many (the table that
 * holds the key, `target`).
 */
export const normalizeCardinalities = <
    T extends {
        sourceCardinality: Cardinality;
        targetCardinality: Cardinality;
    },
>(
    relationship: T
): T =>
    relationship.sourceCardinality === 'many' &&
    relationship.targetCardinality === 'many'
        ? { ...relationship, sourceCardinality: 'one' }
        : relationship;

export const dbRelationshipSchema: z.ZodType<DBRelationship> = z
    .object({
        id: z.string(),
        name: z.string(),
        sourceSchema: z.string().or(z.null()).optional(),
        sourceTableId: z.string(),
        targetSchema: z.string().or(z.null()).optional(),
        targetTableId: z.string(),
        sourceFieldId: z.string(),
        targetFieldId: z.string(),
        sourceCardinality: z.union([z.literal('one'), z.literal('many')]),
        targetCardinality: z.union([z.literal('one'), z.literal('many')]),
        createdAt: z.number(),
    })
    // diagrams saved before many-to-many was dropped still load
    .transform(normalizeCardinalities);

export type RelationshipType = 'one_to_one' | 'one_to_many' | 'many_to_one';

export const determineRelationshipType = (relationship: {
    sourceCardinality: Cardinality;
    targetCardinality: Cardinality;
}): RelationshipType => {
    const { sourceCardinality, targetCardinality } =
        normalizeCardinalities(relationship);
    if (sourceCardinality === 'one' && targetCardinality === 'one')
        return 'one_to_one';
    if (sourceCardinality === 'one') return 'one_to_many';
    return 'many_to_one';
};

export const determineCardinalities = (
    relationshipType: RelationshipType
): {
    sourceCardinality: Cardinality;
    targetCardinality: Cardinality;
} => {
    switch (relationshipType) {
        case 'one_to_one':
            return { sourceCardinality: 'one', targetCardinality: 'one' };
        case 'one_to_many':
            return { sourceCardinality: 'one', targetCardinality: 'many' };
        case 'many_to_one':
            return { sourceCardinality: 'many', targetCardinality: 'one' };
    }
};
