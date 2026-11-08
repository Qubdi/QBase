import { collectionOf, listOf } from '../model/collection';
import type { Column } from '../model/column';
import type { Design } from '../model/design';
import type { Id } from '../model/id';
import type { Key } from '../model/key';
import type { Rule } from '../model/rule';

export type IdKind =
    | 'design'
    | 'entity'
    | 'column'
    | 'key'
    | 'rule'
    | 'link'
    | 'dependency'
    | 'region'
    | 'memo'
    | 'userType';

/**
 * Gives every record a new id (chosen by `next`) and rewrites every reference
 * consistently. Dependencies that point at an entity that is not in the design
 * are dropped. Used for export (small counters) and import (fresh random ids).
 */
export function relabel(
    design: Design,
    next: (kind: IdKind, oldId: Id) => Id
): Design {
    const entityMap = new Map<Id, Id>();
    const columnMap = new Map<Id, Id>();
    const keyMap = new Map<Id, Id>();
    const ruleMap = new Map<Id, Id>();
    const regionMap = new Map<Id, Id>();

    const id = next('design', design.id);
    for (const entity of listOf(design.entities))
        entityMap.set(entity.id, next('entity', entity.id));
    for (const entity of listOf(design.entities)) {
        for (const c of entity.columnIds) columnMap.set(c, next('column', c));
        for (const k of entity.keyIds) keyMap.set(k, next('key', k));
        for (const r of entity.ruleIds) ruleMap.set(r, next('rule', r));
    }
    for (const region of listOf(design.regions))
        regionMap.set(region.id, next('region', region.id));

    const mapped = (map: Map<Id, Id>, old: Id): Id => map.get(old) ?? old;

    const columns: Record<Id, Column> = {};
    for (const [old, column] of Object.entries(design.columns)) {
        const fresh = mapped(columnMap, old);
        columns[fresh] = { ...column, id: fresh };
    }
    const keys: Record<Id, Key> = {};
    for (const [old, key] of Object.entries(design.keys)) {
        const fresh = mapped(keyMap, old);
        keys[fresh] = {
            ...key,
            id: fresh,
            members: key.members.map((c) => mapped(columnMap, c)),
        };
    }
    const rules: Record<Id, Rule> = {};
    for (const [old, rule] of Object.entries(design.rules)) {
        const fresh = mapped(ruleMap, old);
        rules[fresh] = { ...rule, id: fresh };
    }

    const entities = listOf(design.entities).map((entity) => {
        const out = {
            ...entity,
            id: mapped(entityMap, entity.id),
            columnIds: entity.columnIds.map((c) => mapped(columnMap, c)),
            keyIds: entity.keyIds.map((k) => mapped(keyMap, k)),
            ruleIds: entity.ruleIds.map((r) => mapped(ruleMap, r)),
        };
        if (entity.regionId !== undefined)
            out.regionId = mapped(regionMap, entity.regionId);
        return out;
    });
    const links = listOf(design.links).map((link) => ({
        ...link,
        id: next('link', link.id),
        sourceEntityId: mapped(entityMap, link.sourceEntityId),
        sourceColumnId: mapped(columnMap, link.sourceColumnId),
        targetEntityId: mapped(entityMap, link.targetEntityId),
        targetColumnId: mapped(columnMap, link.targetColumnId),
    }));
    const dependencies = design.dependencies
        .filter(
            (dep) =>
                entityMap.has(dep.tableId) &&
                entityMap.has(dep.dependentTableId)
        )
        .map((dep) => ({
            ...dep,
            id: next('dependency', dep.id),
            tableId: mapped(entityMap, dep.tableId),
            dependentTableId: mapped(entityMap, dep.dependentTableId),
        }));
    const regions = listOf(design.regions).map((region) => ({
        ...region,
        id: mapped(regionMap, region.id),
    }));
    const memos = listOf(design.memos).map((memo) => ({
        ...memo,
        id: next('memo', memo.id),
        ...(memo.anchor
            ? {
                  anchor: {
                      kind: memo.anchor.kind,
                      id: mapped(
                          memo.anchor.kind === 'region'
                              ? regionMap
                              : memo.anchor.kind === 'entity'
                                ? entityMap
                                : columnMap,
                          memo.anchor.id
                      ),
                  },
              }
            : {}),
    }));
    const userTypes = listOf(design.userTypes).map((type) => ({
        ...type,
        id: next('userType', type.id),
    }));

    return {
        ...design,
        id,
        entities: collectionOf(entities),
        columns,
        keys,
        rules,
        links: collectionOf(links),
        userTypes: collectionOf(userTypes),
        regions: collectionOf(regions),
        memos: collectionOf(memos),
        dependencies,
    };
}
