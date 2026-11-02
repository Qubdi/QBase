import type { Cardinality, DBRelationship } from '../db-relationship';

export type RelationshipDiffAttribute =
    | 'name'
    | 'sourceSchema'
    | 'sourceTableId'
    | 'targetSchema'
    | 'targetTableId'
    | 'sourceFieldId'
    | 'targetFieldId'
    | 'sourceCardinality'
    | 'targetCardinality';

export interface RelationshipDiffAdded<T = DBRelationship> {
    object: 'relationship';
    type: 'added';
    newRelationship: T;
}

export interface RelationshipDiffRemoved {
    object: 'relationship';
    type: 'removed';
    relationshipId: string;
}

export interface RelationshipDiffChanged {
    object: 'relationship';
    type: 'changed';
    relationshipId: string;
    newRelationshipId: string;
    attribute: RelationshipDiffAttribute;
    oldValue?: string | Cardinality | null;
    newValue?: string | Cardinality | null;
}

export type RelationshipDiff<T = DBRelationship> =
    | RelationshipDiffAdded<T>
    | RelationshipDiffRemoved
    | RelationshipDiffChanged;
