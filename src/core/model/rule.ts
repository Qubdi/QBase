import type { ExtraKeys } from './column';
import type { Id } from './id';

/** A table-level check constraint. */
export interface Rule {
    id: Id;
    /** the condition as written inside CHECK ( ... ) */
    expression: string;
    createdAt: number;
    extra?: ExtraKeys;
}
