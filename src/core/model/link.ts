import type { ExtraKeys } from './column';
import type { Id } from './id';

export type Cardinality = 'one' | 'many';

/**
 * A foreign-key line. The source is the referenced ("parent") side, the
 * target holds the foreign key. Only one/one, one/many and many/one exist.
 */
export interface Link {
    id: Id;
    name: string;
    sourceEntityId: Id;
    sourceColumnId: Id;
    sourceSchema?: string;
    targetEntityId: Id;
    targetColumnId: Id;
    targetSchema?: string;
    sourceCardinality: Cardinality;
    targetCardinality: Cardinality;
    createdAt: number;
    extra?: ExtraKeys;
}

/** many/many does not exist: it becomes one/many (source one, target many). */
export function normaliseCardinality<
    T extends Pick<Link, 'sourceCardinality' | 'targetCardinality'>,
>(link: T): T {
    if (link.sourceCardinality === 'many' && link.targetCardinality === 'many')
        return { ...link, sourceCardinality: 'one' };
    return link;
}
