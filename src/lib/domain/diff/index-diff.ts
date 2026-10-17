import type { DBIndex, IndexType } from '../db-index';

export type IndexDiffAttribute =
    'name' | 'unique' | 'fieldIds' | 'type' | 'comments';

export interface IndexDiffAdded<T = DBIndex> {
    object: 'index';
    type: 'added';
    tableId: string;
    newIndex: T;
}

export interface IndexDiffRemoved {
    object: 'index';
    type: 'removed';
    indexId: string;
    tableId: string;
}

export interface IndexDiffChanged {
    object: 'index';
    type: 'changed';
    indexId: string;
    newIndexId: string;
    tableId: string;
    attribute: IndexDiffAttribute;
    oldValue?: string | boolean | string[] | IndexType | null;
    newValue?: string | boolean | string[] | IndexType | null;
}

export type IndexDiff<T = DBIndex> =
    IndexDiffAdded<T> | IndexDiffRemoved | IndexDiffChanged;
