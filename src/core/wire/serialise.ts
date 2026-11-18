import type { Column } from '../model/column';
import type { Design } from '../model/design';
import type { Dependency } from '../model/dependency';
import type { Entity } from '../model/entity';
import type { Key } from '../model/key';
import type { Link } from '../model/link';
import { anchorExists, memoPosition } from '../model/memo';
import type { Memo } from '../model/memo';
import type { Region } from '../model/region';
import { isUnrestricted } from '../model/visibility-filter';
import type { Rule } from '../model/rule';
import type { UserType } from '../model/user-type';
import type { RawRecord } from './record-reader';
import { CURRENT_VERSION, VERSION_KEY } from './version';

/** Drops keys whose value is undefined, so the JSON has no holes. */
function clean(record: RawRecord): RawRecord {
    const out: RawRecord = {};
    for (const [key, value] of Object.entries(record)) {
        if (value !== undefined) out[key] = value;
    }
    return out;
}

/** Unknown values nested deeper than this are cut: JSON.stringify and structured clone overflow the stack. */
export const MAX_EXTRA_DEPTH = 100;

/** A copy of `value` with anything nested deeper than `limit` replaced by null. */
function shallowEnough(value: unknown, limit: number): unknown {
    if (typeof value !== 'object' || value === null) return value;
    if (limit <= 0) return null;
    if (Array.isArray(value))
        return value.map((item) => shallowEnough(item, limit - 1));
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
            key,
            shallowEnough(item, limit - 1),
        ])
    );
}

/** Unknown keys come first so a known key can never be overridden by them. */
function withExtra(extra: object | undefined, known: RawRecord): RawRecord {
    const safe = extra
        ? (shallowEnough(extra, MAX_EXTRA_DEPTH) as object)
        : extra;
    return { ...safe, ...clean(known) };
}

function wireColumn(column: Column): RawRecord {
    return withExtra(column.extra, {
        id: column.id,
        name: column.name,
        type: withExtra(column.type.extra, {
            id: column.type.id,
            name: column.type.name,
        }),
        primaryKey: column.primaryKey,
        unique: column.unique,
        nullable: column.nullable,
        increment: column.increment,
        isArray: column.isArray,
        createdAt: column.createdAt,
        characterMaximumLength:
            column.length === undefined ? undefined : String(column.length),
        precision: column.precision,
        scale: column.scale,
        default: column.default,
        collation: column.collation,
        comments: column.comments,
        check: column.check,
        domain: column.domain,
        generatedExpression: column.generated?.expression,
        generatedStored: column.generated ? column.generated.stored : undefined,
    });
}

function wireKey(key: Key): RawRecord {
    return withExtra(key.extra, {
        id: key.id,
        name: key.label,
        unique: key.distinct,
        fieldIds: key.members,
        createdAt: key.madeAt,
        type: key.algorithm,
        isPrimaryKey: key.pk,
        descendingFieldIds:
            key.descending && key.descending.length > 0
                ? key.descending
                : undefined,
        where: key.where,
        comments: key.note,
    });
}

function wireRule(rule: Rule): RawRecord {
    return withExtra(rule.extra, {
        id: rule.id,
        expression: rule.expression,
        createdAt: rule.createdAt,
    });
}

function wireEntity(design: Design, entity: Entity, order: number): RawRecord {
    const rules = entity.ruleIds
        .filter((id) => Object.hasOwn(design.rules, id))
        .map((id) => wireRule(design.rules[id]));
    return withExtra(entity.extra, {
        id: entity.id,
        name: entity.name,
        schema: entity.schema,
        x: entity.x,
        y: entity.y,
        fields: entity.columnIds
            .filter((id) => Object.hasOwn(design.columns, id))
            .map((id) => wireColumn(design.columns[id])),
        indexes: entity.keyIds
            .filter((id) => Object.hasOwn(design.keys, id))
            .map((id) => wireKey(design.keys[id])),
        checkConstraints: rules.length > 0 ? rules : undefined,
        color: entity.color,
        isView: entity.kind === 'view',
        isMaterializedView: entity.materialized ? true : undefined,
        createdAt: entity.createdAt,
        width: entity.width,
        comments: entity.comments,
        order,
        expanded: entity.expanded,
        parentAreaId: entity.regionId,
    });
}

function wireLink(link: Link): RawRecord {
    return withExtra(link.extra, {
        id: link.id,
        name: link.name,
        sourceSchema: link.sourceSchema,
        sourceTableId: link.sourceEntityId,
        targetSchema: link.targetSchema,
        targetTableId: link.targetEntityId,
        sourceFieldId: link.sourceColumnId,
        targetFieldId: link.targetColumnId,
        sourceCardinality: link.sourceCardinality,
        targetCardinality: link.targetCardinality,
        createdAt: link.createdAt,
    });
}

function wireDependency(dep: Dependency): RawRecord {
    return withExtra(dep.extra, {
        id: dep.id,
        schema: dep.schema,
        tableId: dep.tableId,
        dependentSchema: dep.dependentSchema,
        dependentTableId: dep.dependentTableId,
        createdAt: dep.createdAt,
    });
}

function wireUserType(type: UserType, order: number): RawRecord {
    return withExtra(type.extra, {
        id: type.id,
        schema: type.schema,
        name: type.name,
        kind: type.kind,
        values: type.values,
        baseType: type.base,
        fields: type.members?.map((m) => ({ field: m.name, type: m.type })),
        order,
    });
}

function wireRegion(region: Region, order: number): RawRecord {
    return withExtra(region.extra, {
        id: region.id,
        name: region.label,
        x: region.box.x,
        y: region.box.y,
        width: region.box.width,
        height: region.box.height,
        color: region.tint,
        order,
    });
}

const WIRE_ANCHOR = {
    region: 'area',
    entity: 'table',
    column: 'field',
} as const;

/**
 * A note is written with its place on the canvas (x and y, as the old readers
 * expect) and, when it has one, what it is attached to.
 */
function wireMemo(design: Design, memo: Memo, order: number): RawRecord {
    const at = memoPosition(design, memo);
    const anchored = memo.anchor && anchorExists(design, memo.anchor);
    return withExtra(memo.extra, {
        id: memo.id,
        content: memo.body,
        x: at.x,
        y: at.y,
        ...(anchored && memo.anchor
            ? {
                  anchorType: WIRE_ANCHOR[memo.anchor.kind],
                  anchorId: memo.anchor.id,
              }
            : {}),
        width: memo.box.width,
        height: memo.box.height,
        color: memo.tint,
        order,
    });
}

/**
 * The saved JSON of a design, with the old keys (data-format section 3). Real
 * ids are kept (the server and re-sync depend on them). Table order in the
 * array is the side-list order and `order` is written for every table, area,
 * note and custom type (DAT-032). Dates become ISO text. Unknown keys read
 * earlier are written back. The version key is always written (DAT-064).
 */
export function serialise(design: Design): RawRecord {
    const entities = design.entities.order.map(
        (id) => design.entities.byId[id]
    );
    return withExtra(design.extra, {
        [VERSION_KEY]: CURRENT_VERSION,
        id: design.id,
        name: design.name,
        databaseType: design.databaseType,
        databaseEdition: design.databaseEdition,
        tables: entities.map((entity, i) => wireEntity(design, entity, i)),
        relationships: design.links.order.map((id) =>
            wireLink(design.links.byId[id])
        ),
        dependencies: design.dependencies.map(wireDependency),
        areas: design.regions.order.map((id, i) =>
            wireRegion(design.regions.byId[id], i)
        ),
        customTypes: design.userTypes.order.map((id, i) =>
            wireUserType(design.userTypes.byId[id], i)
        ),
        notes: design.memos.order.map((id, i) =>
            wireMemo(design, design.memos.byId[id], i)
        ),
        filter: isUnrestricted(design.filter)
            ? undefined
            : {
                  ...(design.filter?.schemaIds
                      ? { schemaIds: [...design.filter.schemaIds] }
                      : {}),
                  ...(design.filter?.tableIds
                      ? { tableIds: [...design.filter.tableIds] }
                      : {}),
              },
        createdAt: new Date(design.createdAt).toISOString(),
        updatedAt: new Date(design.updatedAt).toISOString(),
    });
}

/** The same, as text with 2-space indent (the file and server body form). */
export function serialiseText(design: Design): string {
    return JSON.stringify(serialise(design), null, 2);
}
