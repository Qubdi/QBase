import type { DBTable } from '../db-table';

export type TableDiffAttribute = keyof Pick<
    DBTable,
    'name' | 'comments' | 'color' | 'x' | 'y' | 'width'
>;

export interface TableDiffChanged {
    object: 'table';
    type: 'changed';
    tableId: string;
    newTableId: string;
    attribute: TableDiffAttribute;
    oldValue?: string | number | null;
    newValue?: string | number | null;
}

export interface TableDiffRemoved {
    object: 'table';
    type: 'removed';
    tableId: string;
}

export interface TableDiffAdded<T = DBTable> {
    object: 'table';
    type: 'added';
    tableAdded: T;
}

export type TableDiff<T = DBTable> =
    TableDiffChanged | TableDiffRemoved | TableDiffAdded<T>;
