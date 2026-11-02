import type { DataType } from '@/lib/data/data-types/data-types';
import type { DBField } from '../db-field';

export type FieldDiffAttribute =
    | 'name'
    | 'type'
    | 'primaryKey'
    | 'unique'
    | 'nullable'
    | 'comments'
    | 'characterMaximumLength'
    | 'precision'
    | 'scale'
    | 'increment'
    | 'isArray';

export interface FieldDiffAdded<T = DBField> {
    object: 'field';
    type: 'added';
    tableId: string;
    newField: T;
}

export interface FieldDiffRemoved {
    object: 'field';
    type: 'removed';
    fieldId: string;
    tableId: string;
}

export interface FieldDiffChanged {
    object: 'field';
    type: 'changed';
    fieldId: string;
    newFieldId: string;
    tableId: string;
    attribute: FieldDiffAttribute;
    oldValue: string | boolean | DataType | number;
    newValue: string | boolean | DataType | number;
}

export type FieldDiff<T = DBField> =
    FieldDiffAdded<T> | FieldDiffRemoved | FieldDiffChanged;
