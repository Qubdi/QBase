import type { Id } from './id';

/** Reference to a column type: `id` is the catalogue key, `name` the display text. */
export interface TypeRef {
    id: string;
    name: string;
}

/** Character length of a column: a number, or `max` where a database allows it. */
export type ColumnLength = number | 'max';

/** Keys that were present in a saved file but are not known to this editor. */
export type ExtraKeys = Readonly<Record<string, unknown>>;

export interface Column {
    id: Id;
    name: string;
    type: TypeRef;
    primaryKey: boolean;
    unique: boolean;
    nullable: boolean;
    increment?: boolean;
    isArray?: boolean;
    createdAt: number;
    length?: ColumnLength;
    precision?: number;
    scale?: number;
    /** raw SQL text, exactly as written after DEFAULT */
    default?: string;
    collation?: string;
    comments?: string;
    /** legacy single column-level check; kept so nothing is lost on a round trip */
    check?: string;
    extra?: ExtraKeys;
}
