import type { Area } from '../area';

export type AreaDiffAttribute = keyof Pick<
    Area,
    'name' | 'color' | 'x' | 'y' | 'width' | 'height'
>;

export interface AreaDiffChanged {
    object: 'area';
    type: 'changed';
    areaId: string;
    newAreaId: string;
    attribute: AreaDiffAttribute;
    oldValue?: string | number | null;
    newValue?: string | number | null;
}

export interface AreaDiffRemoved {
    object: 'area';
    type: 'removed';
    areaId: string;
}

export interface AreaDiffAdded<T = Area> {
    object: 'area';
    type: 'added';
    areaAdded: T;
}

export type AreaDiff<T = Area> =
    AreaDiffChanged | AreaDiffRemoved | AreaDiffAdded<T>;
