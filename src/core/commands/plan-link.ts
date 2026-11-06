import type { TypeRef } from '../model/column';
import type { DatabaseType } from '../model/database';
import { createLink } from '../model/defaults';
import type { Design } from '../model/design';
import type { Id } from '../model/id';
import { entityOf, linkBetween } from '../model/lookup';
import type { Link } from '../model/link';
import type { Command } from './command';
import type { PlanOptions } from './plan-entity';

const EQUIVALENTS: Partial<Record<DatabaseType, [string, string][]>> = {
    postgresql: [
        ['serial', 'integer'],
        ['smallserial', 'smallint'],
        ['bigserial', 'bigint'],
    ],
    mysql: [
        ['int', 'integer'],
        ['tinyint', 'boolean'],
    ],
};

/** Same type, or one of the short list of known equivalents (EDT-169). */
export function typesCompatible(
    databaseType: DatabaseType,
    a: TypeRef,
    b: TypeRef
): boolean {
    const x = a.id.toLowerCase();
    const y = b.id.toLowerCase();
    if (x === y) return true;
    return (EQUIVALENTS[databaseType] ?? []).some(
        ([p, q]) => (x === p && y === q) || (x === q && y === p)
    );
}

export type LinkPlan =
    | { kind: 'ok'; command: Command; link: Link }
    | { kind: 'exists'; link: Link }
    | { kind: 'refused'; reason: 'missing' | 'view' | 'incompatible' };

/**
 * Plans a new link between two columns (EDT-153 to EDT-168). The first column
 * is the source (the referenced side). A pair that is already joined, in
 * either direction, returns the existing link; a view cannot take part; the
 * types must be compatible.
 */
export function planLink(
    design: Design,
    source: { entityId: Id; columnId: Id },
    target: { entityId: Id; columnId: Id },
    options: PlanOptions = {}
): LinkPlan {
    const a = entityOf(design, source.entityId);
    const b = entityOf(design, target.entityId);
    const ca = design.columns[source.columnId];
    const cb = design.columns[target.columnId];
    if (
        !a ||
        !b ||
        !ca ||
        !cb ||
        !a.columnIds.includes(source.columnId) ||
        !b.columnIds.includes(target.columnId)
    )
        return { kind: 'refused', reason: 'missing' };
    if (a.kind === 'view' || b.kind === 'view')
        return { kind: 'refused', reason: 'view' };
    const existing = linkBetween(design, source, target);
    if (existing) return { kind: 'exists', link: existing };
    if (!typesCompatible(design.databaseType, ca.type, cb.type))
        return { kind: 'refused', reason: 'incompatible' };
    const link = createLink(design, source, target, options);
    return {
        kind: 'ok',
        link,
        command: { type: 'item.insert', collection: 'links', item: link },
    };
}

export type CardinalityChoice = 'one-to-one' | 'one-to-many' | 'many-to-one';

/** The link with its two ends exchanged: tables, columns and schemas. */
function swapped(link: Link): Link {
    return {
        ...link,
        sourceEntityId: link.targetEntityId,
        sourceColumnId: link.targetColumnId,
        sourceSchema: link.targetSchema,
        targetEntityId: link.sourceEntityId,
        targetColumnId: link.sourceColumnId,
        targetSchema: link.sourceSchema,
        sourceCardinality: link.targetCardinality,
        targetCardinality: link.sourceCardinality,
    };
}

function endsPatch(link: Link) {
    return {
        sourceEntityId: link.sourceEntityId,
        sourceColumnId: link.sourceColumnId,
        sourceSchema: link.sourceSchema,
        targetEntityId: link.targetEntityId,
        targetColumnId: link.targetColumnId,
        targetSchema: link.targetSchema,
        sourceCardinality: link.sourceCardinality,
        targetCardinality: link.targetCardinality,
    };
}

/**
 * Sets the cardinality (EDT-170, EDT-176). The "many" side is always the
 * target, so many-to-one swaps the two ends and stores one-to-many.
 */
export function planSetCardinality(
    link: Link,
    choice: CardinalityChoice
): Command {
    let next: Link;
    if (choice === 'one-to-one')
        next = { ...link, sourceCardinality: 'one', targetCardinality: 'one' };
    else if (choice === 'one-to-many')
        next = { ...link, sourceCardinality: 'one', targetCardinality: 'many' };
    else
        next = {
            ...swapped({
                ...link,
                sourceCardinality: 'many',
                targetCardinality: 'one',
            }),
        };
    return {
        type: 'item.update',
        collection: 'links',
        id: link.id,
        patch: endsPatch(next),
    };
}

/**
 * Switch tables (EDT-177): source and target exchange their tables, columns
 * and schemas. A many-to-one result is turned into one-to-many.
 */
export function planSwitchLink(link: Link): Command {
    const same = link.sourceCardinality === link.targetCardinality;
    const next: Link = {
        ...swapped(link),
        // one-to-many and many-to-one both end as one-to-many
        sourceCardinality: same ? link.sourceCardinality : 'one',
        targetCardinality: same ? link.targetCardinality : 'many',
    };
    return {
        type: 'item.update',
        collection: 'links',
        id: link.id,
        patch: endsPatch(next),
    };
}

export function planDeleteLink(id: Id): Command {
    return { type: 'item.remove', collection: 'links', id };
}
