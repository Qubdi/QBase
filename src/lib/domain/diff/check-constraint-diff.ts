import type { DBCheckConstraint } from '../db-check-constraint';

export type CheckConstraintDiffAttribute = 'expression';

export interface CheckConstraintDiffAdded<T = DBCheckConstraint> {
    object: 'checkConstraint';
    type: 'added';
    tableId: string;
    newCheckConstraint: T;
}

export interface CheckConstraintDiffRemoved {
    object: 'checkConstraint';
    type: 'removed';
    checkConstraintId: string;
    tableId: string;
}

export interface CheckConstraintDiffChanged {
    object: 'checkConstraint';
    type: 'changed';
    checkConstraintId: string;
    newCheckConstraintId: string;
    tableId: string;
    attribute: CheckConstraintDiffAttribute;
    oldValue?: string | null;
    newValue?: string | null;
}

export type CheckConstraintDiff<T = DBCheckConstraint> =
    | CheckConstraintDiffAdded<T>
    | CheckConstraintDiffRemoved
    | CheckConstraintDiffChanged;
