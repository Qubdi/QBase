import { emptyCollection } from './collection';
import type { Column } from './column';
import type { DatabaseEdition, DatabaseType } from './database';
import { editionFits, traitsOf } from './database';
import type { Design } from './design';
import type { Entity, EntityKind } from './entity';
import { TABLE_COLOR, VIEW_COLOR } from './entity';
import type { EntityParts } from './entity-parts';
import type { Id } from './id';
import type { RandomInt } from './ids';
import { newDesignId, newId } from './ids';
import type { Key } from './key';
import type { Link } from './link';
import type { Memo } from './memo';
import { MEMO_TINT, MEMO_SIZE } from './memo';
import type { Region } from './region';
import { REGION_SIZE } from './region';
import type { Rule } from './rule';
import type { UserType } from './user-type';

/** Colours offered for new regions: one is picked at random. */
export const REGION_COLORS = [
    '#ff6b6b',
    '#ff8fab',
    '#c77dff',
    '#9d8df1',
    '#6d83f2',
    '#8eb7ff',
    '#4cc9f0',
    '#43d9ad',
    '#7ee08f',
    '#c6e377',
    '#ffe374',
    '#ffa94d',
];

export interface NewDesignOptions {
    name?: string;
    /** used when `name` is empty after trimming (the localized default) */
    defaultName?: string;
    databaseType: DatabaseType;
    databaseEdition?: DatabaseEdition;
    id?: Id;
    now?: number;
    random?: RandomInt;
}

/** A blank design: every collection present and empty (DAT-022). */
export function createDesign(options: NewDesignOptions): Design {
    const now = options.now ?? Date.now();
    const trimmed = (options.name ?? '').trim();
    const edition =
        options.databaseEdition &&
        editionFits(options.databaseType, options.databaseEdition)
            ? options.databaseEdition
            : undefined;
    const design: Design = {
        id: options.id ?? newDesignId(options.random),
        name: trimmed || (options.defaultName ?? 'Untitled'),
        databaseType: options.databaseType,
        createdAt: now,
        updatedAt: now,
        entities: emptyCollection(),
        columns: {},
        keys: {},
        rules: {},
        links: emptyCollection(),
        userTypes: emptyCollection(),
        regions: emptyCollection(),
        memos: emptyCollection(),
        dependencies: [],
    };
    return edition ? { ...design, databaseEdition: edition } : design;
}

/** A new column named `field_N`, nullable, not a key, default type (DAT-035). */
export function createColumn(
    design: Pick<Design, 'databaseType'>,
    columnCount: number,
    options: Partial<Column> & { now?: number; random?: RandomInt } = {}
): Column {
    const { now, random, ...given } = options;
    const typeName = traitsOf(design.databaseType).defaultColumnType;
    return {
        id: newId(random),
        name: `field_${columnCount + 1}`,
        type: { id: typeName, name: typeName },
        primaryKey: false,
        unique: false,
        nullable: true,
        createdAt: now ?? Date.now(),
        ...given,
    };
}

/** A new index named `index_N`: no columns, not unique (DAT-043). */
export function createKey(
    keyCount: number,
    options: Partial<Key> & { now?: number; random?: RandomInt } = {}
): Key {
    const { now, random, ...given } = options;
    return {
        id: newId(random),
        label: `index_${keyCount + 1}`,
        distinct: false,
        members: [],
        madeAt: now ?? Date.now(),
        ...given,
    };
}

/** A new, empty check constraint (DAT-051). */
export function createRule(
    options: Partial<Rule> & { now?: number; random?: RandomInt } = {}
): Rule {
    const { now, random, ...given } = options;
    return {
        id: newId(random),
        expression: '',
        createdAt: now ?? Date.now(),
        ...given,
    };
}

export interface NewEntityOptions {
    kind?: EntityKind;
    name?: string;
    schema?: string;
    x?: number;
    y?: number;
    now?: number;
    random?: RandomInt;
}

/**
 * The schema a new table takes (editor 14.2): with visible schemas, the
 * database default if it is among them, else the first visible; with none,
 * the database default (or no schema where the database has none).
 */
export function schemaForNewEntity(
    databaseType: DatabaseType,
    visibleSchemas: readonly string[] = []
): string | undefined {
    const traits = traitsOf(databaseType);
    if (!traits.hasSchemas) return undefined;
    if (visibleSchemas.length === 0) return traits.defaultSchema;
    if (traits.defaultSchema && visibleSchemas.includes(traits.defaultSchema))
        return traits.defaultSchema;
    return visibleSchemas[0];
}

/**
 * A new table or view (DAT-026): named `table_N` / `view_N` (N counts that
 * kind plus one), one `id` primary-key column and its primary-key index.
 * A view keeps the `id` column but has no indexes. Pass `schema` to override
 * the database default (see schemaForNewEntity).
 */
export function createEntityParts(
    design: Pick<Design, 'databaseType' | 'entities'>,
    options: NewEntityOptions = {}
): EntityParts {
    const kind = options.kind ?? 'table';
    const now = options.now ?? Date.now();
    const sameKind = design.entities.order.filter(
        (id) => design.entities.byId[id].kind === kind
    ).length;
    const traits = traitsOf(design.databaseType);
    const column: Column = createColumn(design, 0, {
        name: 'id',
        primaryKey: true,
        unique: true,
        nullable: false,
        now,
        random: options.random,
    });
    const keys: Key[] =
        kind === 'view'
            ? []
            : [
                  {
                      id: newId(options.random),
                      label: '',
                      distinct: true,
                      members: [column.id],
                      pk: true,
                      madeAt: now,
                  },
              ];
    const entity: Entity = {
        id: newId(options.random),
        name: options.name ?? `${kind}_${sameKind + 1}`,
        kind,
        x: options.x ?? 0,
        y: options.y ?? 0,
        color: kind === 'view' ? VIEW_COLOR : TABLE_COLOR,
        createdAt: now,
        columnIds: [column.id],
        keyIds: keys.map((key) => key.id),
        ruleIds: [],
    };
    const schema = options.schema ?? traits.defaultSchema;
    if (traits.hasSchemas && schema) entity.schema = schema;
    return { entity, columns: [column], keys, rules: [] };
}

/** A new foreign-key link: one/one, named `<table>_<column>_fk` (DAT-049). */
export function createLink(
    design: Design,
    source: { entityId: Id; columnId: Id },
    target: { entityId: Id; columnId: Id },
    options: Partial<Link> & { now?: number; random?: RandomInt } = {}
): Link {
    const { now, random, ...given } = options;
    const sourceEntity = design.entities.byId[source.entityId];
    const targetEntity = design.entities.byId[target.entityId];
    const sourceColumn = design.columns[source.columnId];
    const link: Link = {
        id: newId(random),
        name: `${sourceEntity?.name ?? ''}_${sourceColumn?.name ?? ''}_fk`,
        sourceEntityId: source.entityId,
        sourceColumnId: source.columnId,
        targetEntityId: target.entityId,
        targetColumnId: target.columnId,
        sourceCardinality: 'one',
        targetCardinality: 'one',
        createdAt: now ?? Date.now(),
    };
    if (sourceEntity?.schema) link.sourceSchema = sourceEntity.schema;
    if (targetEntity?.schema) link.targetSchema = targetEntity.schema;
    return { ...link, ...given };
}

/** A new enum type named `type_N` (DAT-054). */
export function createUserType(
    design: Pick<Design, 'userTypes'>,
    options: Partial<UserType> & { random?: RandomInt } = {}
): UserType {
    const { random, ...given } = options;
    return {
        id: newId(random),
        name: `type_${design.userTypes.order.length + 1}`,
        kind: 'enum',
        values: [],
        ...given,
    };
}

/** A new region `Area N`, 300 by 200, random palette colour (DAT-055). */
export function createRegion(
    design: Pick<Design, 'regions'>,
    options: Partial<Region> & { random?: RandomInt } = {}
): Region {
    const { random, ...given } = options;
    const pick = random
        ? random(REGION_COLORS.length)
        : Math.floor(Math.random() * REGION_COLORS.length);
    return {
        id: newId(random),
        label: `Area ${design.regions.order.length + 1}`,
        tint: REGION_COLORS[pick],
        box: { x: 0, y: 0, ...REGION_SIZE },
        ...given,
    };
}

/** A new empty memo, 200 by 150, `#ffe374` (DAT-056). */
export function createMemo(
    options: Partial<Memo> & { random?: RandomInt } = {}
): Memo {
    const { random, ...given } = options;
    return {
        id: newId(random),
        body: '',
        tint: MEMO_TINT,
        box: { x: 0, y: 0, ...MEMO_SIZE },
        ...given,
    };
}
