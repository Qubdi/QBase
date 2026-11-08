import type { ExtraKeys } from './column';
import type { Id } from './id';

/** Access methods grouped by the database family that uses them. */
const METHODS_BY_FAMILY = {
    server: ['clustered', 'nonclustered', 'columnstore'],
    special: ['fulltext', 'spatial', 'xml'],
    oracle: ['bitmap'],
    generic: ['index'],
    postgres: ['brin', 'spgist', 'gist', 'gin', 'hash', 'btree'],
} as const;

type Families = typeof METHODS_BY_FAMILY;

/** Every method the saved format may carry. */
export type KeyMethod = Families[keyof Families][number];

/** All methods flattened; the order is not meaningful. */
export const KEY_METHODS: readonly KeyMethod[] =
    Object.values(METHODS_BY_FAMILY).flat();

/** Type guard for text read from a file. */
export function isKeyMethod(value: unknown): value is KeyMethod {
    return (
        typeof value === 'string' &&
        (KEY_METHODS as readonly string[]).indexOf(value) >= 0
    );
}

/** The methods one database family offers, or none for an unknown family. */
export function methodsOfFamily(family: keyof Families): readonly KeyMethod[] {
    return METHODS_BY_FAMILY[family];
}

/**
 * An index over some columns of one entity. `label` may be empty: on the
 * automatic primary-key index that means the database picks the name.
 */
export interface Key {
    id: Id;
    label: string;
    /** columns covered, in index order; all belong to the same entity */
    members: Id[];
    /** true when duplicate values are rejected */
    distinct: boolean;
    /** true for the index that stands in for the primary key */
    pk?: boolean;
    algorithm?: KeyMethod;
    /** members (ids from `members`) sorted from high to low; the others sort ascending */
    descending?: Id[];
    /** predicate of a partial index, as SQL text without the WHERE keyword */
    where?: string;
    note?: string;
    madeAt: number;
    extra?: ExtraKeys;
}
