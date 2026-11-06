import type { ExtraKeys } from './column';
import type { Id } from './id';

export type EntityKind = 'table' | 'view';

export const TABLE_WIDTH = { min: 224, mid: 337, max: 450, default: 224 };

/** Number of columns shown while a table is collapsed. */
export const COLLAPSED_COLUMNS = 10;

export const TABLE_COLOR = '#8eb7ff';
export const VIEW_COLOR = '#b0b0b0';

/** A table or a view: a box with columns. */
export interface Entity {
    id: Id;
    name: string;
    kind: EntityKind;
    /** only meaningful when kind is 'view' */
    materialized?: boolean;
    schema?: string;
    x: number;
    y: number;
    color: string;
    createdAt: number;
    width?: number;
    comments?: string;
    expanded?: boolean;
    /** the region this entity sits in, kept in step with its geometry */
    regionId?: Id;
    /** ids into design.columns, in display order */
    columnIds: Id[];
    /** ids into design.keys, in display order */
    keyIds: Id[];
    /** ids into design.rules, in display order */
    ruleIds: Id[];
    extra?: ExtraKeys;
}
