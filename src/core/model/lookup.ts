import { getItem } from './collection';
import type { Column } from './column';
import type { Design } from './design';
import type { Entity } from './entity';
import type { EntityParts } from './entity-parts';
import type { Id } from './id';
import type { Key } from './key';
import type { Link } from './link';
import type { Rule } from './rule';

export function entityOf(design: Design, id: Id): Entity | undefined {
    return getItem(design.entities, id);
}

function pick<T>(map: Readonly<Record<Id, T>>, ids: readonly Id[]): T[] {
    const out: T[] = [];
    for (const id of ids) {
        if (Object.prototype.hasOwnProperty.call(map, id)) out.push(map[id]);
    }
    return out;
}

export function columnsOf(design: Design, entity: Entity): Column[] {
    return pick(design.columns, entity.columnIds);
}

export function keysOf(design: Design, entity: Entity): Key[] {
    return pick(design.keys, entity.keyIds);
}

export function rulesOf(design: Design, entity: Entity): Rule[] {
    return pick(design.rules, entity.ruleIds);
}

/** The entity's own records as plain lists (a snapshot, shares the records). */
export function partsOf(design: Design, entity: Entity): EntityParts {
    return {
        entity,
        columns: columnsOf(design, entity),
        keys: keysOf(design, entity),
        rules: rulesOf(design, entity),
    };
}

export function hasColumn(design: Design, entityId: Id, columnId: Id): boolean {
    const entity = entityOf(design, entityId);
    return (
        entity !== undefined &&
        entity.columnIds.includes(columnId) &&
        Object.prototype.hasOwnProperty.call(design.columns, columnId)
    );
}

/** Every link that has the entity at either end. */
export function linksOfEntity(design: Design, entityId: Id): Link[] {
    return design.links.order
        .map((id) => design.links.byId[id])
        .filter(
            (link) =>
                link.sourceEntityId === entityId ||
                link.targetEntityId === entityId
        );
}

/** Every link that uses the column at either end. */
export function linksOfColumn(
    design: Design,
    entityId: Id,
    columnId: Id
): Link[] {
    return design.links.order
        .map((id) => design.links.byId[id])
        .filter(
            (link) =>
                (link.sourceEntityId === entityId &&
                    link.sourceColumnId === columnId) ||
                (link.targetEntityId === entityId &&
                    link.targetColumnId === columnId)
        );
}

/** The link that joins the two columns, in either direction (DAT-050). */
export function linkBetween(
    design: Design,
    a: { entityId: Id; columnId: Id },
    b: { entityId: Id; columnId: Id }
): Link | undefined {
    return design.links.order
        .map((id) => design.links.byId[id])
        .find((link) => {
            const forward =
                link.sourceEntityId === a.entityId &&
                link.sourceColumnId === a.columnId &&
                link.targetEntityId === b.entityId &&
                link.targetColumnId === b.columnId;
            const backward =
                link.sourceEntityId === b.entityId &&
                link.sourceColumnId === b.columnId &&
                link.targetEntityId === a.entityId &&
                link.targetColumnId === a.columnId;
            return forward || backward;
        });
}

/** Entities in the order of the side list. */
export function entityList(design: Design): Entity[] {
    return design.entities.order.map((id) => design.entities.byId[id]);
}
