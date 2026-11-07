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

/**
 * `<prefix><n>` for the first `n` from `start` that `taken` does not hold
 * (compared ignoring case), so a default name never repeats an existing one.
 */
export function firstFreeName(
    prefix: string,
    start: number,
    taken: Iterable<string> = []
): string {
    const used = new Set([...taken].map((name) => name.toLowerCase()));
    let n = start;
    while (used.has(`${prefix}${n}`.toLowerCase())) n++;
    return `${prefix}${n}`;
}

/**
 * A new column named `field_N`, nullable, not a key, default type (DAT-035).
 * N is the column count plus one, or the next number whose name is not in
 * `taken` (the names the table already has).
 */
export function createColumn(
    design: Pick<Design, 'databaseType'>,
    columnCount: number,
    options: Partial<Column> & {
        now?: number;
        random?: RandomInt;
        taken?: readonly string[];
    } = {}
): Column {
    const { now, random, taken, ...given } = options;
    const typeName = traitsOf(design.databaseType).defaultColumnType;
    return {
        id: newId(random),
        name: firstFreeName('field_', columnCount + 1, taken),
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
    options: Partial<Key> & {
        now?: number;
        random?: RandomInt;
        taken?: readonly string[];
    } = {}
): Key {
    const { now, random, taken, ...given } = options;
    return {
        id: newId(random),
        label: firstFreeName('index_', keyCount + 1, taken),
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
    const entitySchema = options.schema ?? traits.defaultSchema;
    const sameSchema = design.entities.order
        .map((id) => design.entities.byId[id])
        .filter(
            (e) =>
                (traits.hasSchemas ? (e.schema ?? '') : '') ===
                (traits.hasSchemas ? (entitySchema ?? '') : '')
        )
        .map((e) => e.name);
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
        name:
            options.name ?? firstFreeName(`${kind}_`, sameKind + 1, sameSchema),
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
    const targetColumn = design.columns[target.columnId];
    const plain = `${sourceEntity?.name ?? ''}_${sourceColumn?.name ?? ''}_fk`;
    const taken = new Set(
        design.links.order.map((id) => design.links.byId[id].name.toLowerCase())
    );
    // the spec name first; a second link to the same column also names its holder
    let name = plain;
    if (taken.has(name.toLowerCase()))
        name = `${plain.slice(0, -3)}_${targetEntity?.name ?? ''}_${targetColumn?.name ?? ''}_fk`;
    for (let n = 2; taken.has(name.toLowerCase()); n++)
        name = `${plain.slice(0, -3)}_${targetEntity?.name ?? ''}_${targetColumn?.name ?? ''}_${n}_fk`;
    const link: Link = {
        id: newId(random),
        name,
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
        name: firstFreeName(
            'type_',
            design.userTypes.order.length + 1,
            design.userTypes.order.map((id) => design.userTypes.byId[id].name)
        ),
        kind: 'enum',
        values: [],
        ...given,
    };
}

/** A box from a caller: a position that is not a number becomes 0, a bad size the default. */
function usableBox(
    box: Region['box'] | undefined,
    size: { width: number; height: number }
): Region['box'] | undefined {
    if (!box) return undefined;
    const pos = (v: number): number => (Number.isFinite(v) ? v : 0);
    const dim = (v: number, fallback: number): number =>
        Number.isFinite(v) && v > 0 ? v : fallback;
    return {
        x: pos(box.x),
        y: pos(box.y),
        width: dim(box.width, size.width),
        height: dim(box.height, size.height),
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
        label: firstFreeName(
            'Area ',
            design.regions.order.length + 1,
            design.regions.order.map((id) => design.regions.byId[id].label)
        ),
        tint: REGION_COLORS[pick],
        box: { x: 0, y: 0, ...REGION_SIZE },
        ...given,
        ...(given.box ? { box: usableBox(given.box, REGION_SIZE)! } : {}),
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
        ...(given.box ? { box: usableBox(given.box, MEMO_SIZE)! } : {}),
    };
}
