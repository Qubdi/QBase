import type { Id } from './id';

/** Reference to a column type: `id` is the catalogue key, `name` the display text. */
export interface TypeRef {
    id: string;
    name: string;
    /** keys of the saved type object this editor does not know, written back as they were */
    extra?: ExtraKeys;
}

/** Character length of a column: a number, or `max` where a database allows it. */
export type ColumnLength = number | 'max';

/** Keys that were present in a saved file but are not known to this editor. */
export type ExtraKeys = Readonly<Record<string, unknown>>;

/** A computed column: the expression as SQL text, and whether it is stored (else virtual). */
export interface GeneratedColumn {
    expression: string;
    stored: boolean;
}

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
    /** name of the domain this column was declared with; `type` is the domain's base type */
    domain?: string;
    /** the column is computed from this expression instead of stored from input */
    generated?: GeneratedColumn;
    /** legacy single column-level check; kept so nothing is lost on a round trip */
    check?: string;
    extra?: ExtraKeys;
}
