import { collectionOf } from '../model/collection';
import type { Column, ColumnLength, ExtraKeys, TypeRef } from '../model/column';
import {
    isDatabaseEdition,
    isDatabaseType,
    editionFits,
    traitsOf,
} from '../model/database';
import type { DatabaseType } from '../model/database';
import type { Design } from '../model/design';
import type { Dependency } from '../model/dependency';
import { TABLE_COLOR, VIEW_COLOR } from '../model/entity';
import type { Entity } from '../model/entity';
import type { Id } from '../model/id';
import { newDesignId, newId } from '../model/ids';
import type { RandomInt } from '../model/ids';
import { KEY_METHODS } from '../model/key';
import type { Key, KeyMethod } from '../model/key';
import type { Cardinality, Link } from '../model/link';
import { MEMO_SIZE, MEMO_TINT } from '../model/memo';
import type { Memo } from '../model/memo';
import { REGION_SIZE } from '../model/region';
import type { Region } from '../model/region';
import type { Rule } from '../model/rule';
import type { CompositeMember, UserType } from '../model/user-type';
import { RecordReader, isRecord } from './record-reader';
import type { RawRecord } from './record-reader';
import { upgrade } from './upgrade';
import { VERSION_KEY } from './version';
import type { WireWarning } from './warning';

export interface ParseOptions {
    /** "now" in ms, for dates that are missing or unreadable */
    now?: number;
    random?: RandomInt;
    /** keep keys this editor does not know (default true); an import drops them */
    keepUnknown?: boolean;
}

export interface ParseResult {
    design: Design;
    warnings: WireWarning[];
}

/** One row that has a position hint (`order`) from the file. */
interface Ranked<T> {
    item: T;
    order?: number;
}

/** Numbers first in ascending order, the rest after, each group in read order. */
function sortByOrder<T>(rows: Ranked<T>[]): T[] {
    const withOrder = rows
        .map((row, index) => ({ ...row, index }))
        .filter((row) => row.order !== undefined);
    withOrder.sort((a, b) => a.order! - b.order! || a.index - b.index);
    const without = rows.filter((row) => row.order === undefined);
    return [...withOrder, ...without].map((row) => row.item);
}

/**
 * Reads a saved diagram (file, server content or a joined local record) into
 * the model. Tolerant: old shapes are upgraded, wrong or unknown values are
 * repaired or kept aside, and every repair is listed in `warnings`. Only input
 * that is not an object at all is refused (throws).
 */
export function parse(input: unknown, options: ParseOptions = {}): ParseResult {
    const up = upgrade(input);
    const warnings: WireWarning[] = [...up.warnings];
    const warn = (path: string, message: string) =>
        warnings.push({ path, message });
    const now = options.now ?? Date.now();
    const random = options.random;
    const keep = options.keepUnknown !== false;
    const extrasOf = (reader: RecordReader): ExtraKeys | undefined =>
        keep ? reader.extras() : undefined;
    const withExtras = <T extends { extra?: ExtraKeys }>(
        value: T,
        reader: RecordReader
    ): T => {
        const extra = extrasOf(reader);
        return extra ? { ...value, extra } : value;
    };

    const json = up.json;
    const top = new RecordReader(json, '', warn);
    top.any(VERSION_KEY);
    for (const key of [
        'tables',
        'relationships',
        'dependencies',
        'areas',
        'customTypes',
        'notes',
    ])
        top.any(key);

    const databaseType: DatabaseType = (() => {
        const value = top.str('databaseType');
        if (isDatabaseType(value)) return value;
        warn('databaseType', `unknown database type; treated as generic`);
        return 'generic';
    })();
    const editionText = top.str('databaseEdition');
    const databaseEdition =
        editionText !== undefined &&
        isDatabaseEdition(editionText) &&
        editionFits(databaseType, editionText)
            ? editionText
            : undefined;
    if (editionText !== undefined && databaseEdition === undefined)
        warn(
            'databaseEdition',
            'edition does not fit the database type; ignored'
        );

    const readDate = (key: string): number => {
        const value = top.any(key);
        // an old local row holds a real Date object
        if (value instanceof Date && !Number.isNaN(value.getTime()))
            return value.getTime();
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
            const ms = Date.parse(value);
            if (!Number.isNaN(ms)) return ms;
        }
        if (value !== undefined) warn(key, 'unreadable date; replaced by now');
        return now;
    };
    const createdAt = readDate('createdAt');
    const updatedAt = readDate('updatedAt');

    const idText = top.str('id');
    const diagramName = top.str('name');
    const designExtra = extrasOf(top);

    // ---- regions first: tables point at them
    const regionRows: Ranked<Region>[] = [];
    const regionIds = new Set<Id>();
    (json.areas as unknown[]).forEach((raw, i) => {
        const path = `areas[${i}]`;
        if (!isRecord(raw)) return warn(path, 'not an object; skipped');
        const rd = new RecordReader(raw, path, warn);
        const id = uniqueId(rd.str('id'), regionIds, path, warn, random);
        const region: Region = {
            id,
            label: rd.str('name') ?? `Area ${i + 1}`,
            tint: rd.str('color') ?? '#8eb7ff',
            box: {
                x: rd.num('x') ?? 0,
                y: rd.num('y') ?? 0,
                width: rd.num('width') ?? REGION_SIZE.width,
                height: rd.num('height') ?? REGION_SIZE.height,
            },
        };
        const order = rd.num('order');
        regionRows.push({ item: withExtras(region, rd), order });
    });
    const regions = sortByOrder(regionRows);

    // ---- memos
    const memoRows: Ranked<Memo>[] = [];
    const memoIds = new Set<Id>();
    (json.notes as unknown[]).forEach((raw, i) => {
        const path = `notes[${i}]`;
        if (!isRecord(raw)) return warn(path, 'not an object; skipped');
        const rd = new RecordReader(raw, path, warn);
        const id = uniqueId(rd.str('id'), memoIds, path, warn, random);
        const memo: Memo = {
            id,
            body: rd.str('content') ?? '',
            tint: rd.str('color') ?? MEMO_TINT,
            box: {
                x: rd.num('x') ?? 0,
                y: rd.num('y') ?? 0,
                width: rd.num('width') ?? MEMO_SIZE.width,
                height: rd.num('height') ?? MEMO_SIZE.height,
            },
        };
        const order = rd.num('order');
        memoRows.push({ item: withExtras(memo, rd), order });
    });
    const memos = sortByOrder(memoRows);

    // ---- user types
    const typeRows: Ranked<UserType>[] = [];
    const typeIds = new Set<Id>();
    (json.customTypes as unknown[]).forEach((raw, i) => {
        const path = `customTypes[${i}]`;
        if (!isRecord(raw)) return warn(path, 'not an object; skipped');
        const rd = new RecordReader(raw, path, warn);
        const id = uniqueId(rd.str('id'), typeIds, path, warn, random);
        const kindText = rd.str('kind');
        const kind = kindText === 'composite' ? 'composite' : 'enum';
        if (
            kindText !== undefined &&
            kindText !== 'enum' &&
            kindText !== 'composite'
        )
            warn(`${path}.kind`, 'unknown kind; treated as enum');
        const type: UserType = {
            id,
            name: rd.str('name') ?? `type_${i + 1}`,
            kind,
        };
        const schema = rd.str('schema');
        if (schema) type.schema = schema;
        const values = rd.strings('values');
        if (values) type.values = values;
        const members = readMembers(rd, path, warn);
        if (members) type.members = members;
        const order = rd.num('order');
        typeRows.push({ item: withExtras(type, rd), order });
    });
    const userTypes = sortByOrder(typeRows);

    // ---- entities with their columns, keys and rules
    const columns: Record<Id, Column> = {};
    const keys: Record<Id, Key> = {};
    const rules: Record<Id, Rule> = {};
    const entityIds = new Set<Id>();
    const columnIds = new Set<Id>();
    const keyIds = new Set<Id>();
    const ruleIds = new Set<Id>();
    /** raw entity id -> (raw column id -> final column id) */
    const columnMaps = new Map<Id, Map<Id, Id>>();
    /** raw entity id -> final entity id (the first table that used it) */
    const entityByRaw = new Map<Id, Id>();
    const entityRows: Ranked<Entity>[] = [];

    (json.tables as unknown[]).forEach((raw, i) => {
        const path = `tables[${i}]`;
        if (!isRecord(raw)) return warn(path, 'not an object; skipped');
        const rd = new RecordReader(raw, path, warn);
        const rawId = rd.str('id');
        const id = uniqueId(rawId, entityIds, path, warn, random);
        const isView = rd.bool('isView') ?? false;
        const materialized = rd.bool('isMaterializedView');
        const entity: Entity = {
            id,
            name: rd.str('name') ?? `${isView ? 'view' : 'table'}_${i + 1}`,
            kind: isView ? 'view' : 'table',
            x: rd.num('x') ?? (i % 4) * 320,
            y: rd.num('y') ?? Math.floor(i / 4) * 360,
            color: rd.str('color') ?? (isView ? VIEW_COLOR : TABLE_COLOR),
            createdAt: rd.num('createdAt') ?? now,
            columnIds: [],
            keyIds: [],
            ruleIds: [],
        };
        if (materialized) {
            if (isView) entity.materialized = true;
            else
                warn(
                    `${path}.isMaterializedView`,
                    'only a view can be materialized; ignored'
                );
        }
        const schema = rd.str('schema');
        if (schema) entity.schema = schema;
        const width = rd.num('width');
        if (width !== undefined) entity.width = width;
        const comments = rd.str('comments');
        if (comments !== undefined) entity.comments = comments;
        const expanded = rd.bool('expanded');
        if (expanded !== undefined) entity.expanded = expanded;
        const parentAreaId = rd.str('parentAreaId');
        if (parentAreaId !== undefined) {
            if (regionIds.has(parentAreaId)) entity.regionId = parentAreaId;
            else warn(`${path}.parentAreaId`, 'area does not exist; ignored');
        }
        const order = rd.num('order');

        // columns
        const local = new Map<Id, Id>();
        const fieldList = Array.isArray(raw.fields) ? raw.fields : [];
        rd.any('fields');
        if (!Array.isArray(raw.fields) && raw.fields != null)
            warn(`${path}.fields`, 'expected a list; treated as empty');
        fieldList.forEach((rawField: unknown, f: number) => {
            const fpath = `${path}.fields[${f}]`;
            if (!isRecord(rawField))
                return warn(fpath, 'not an object; skipped');
            const column = readColumn(
                rawField,
                fpath,
                f,
                databaseType,
                now,
                warn,
                keep
            );
            const original =
                typeof rawField.id === 'string' ? rawField.id : undefined;
            const final = uniqueId(original, columnIds, fpath, warn, random);
            const result = { ...column, id: final };
            columns[final] = result;
            entity.columnIds.push(final);
            if (original !== undefined && !local.has(original))
                local.set(original, final);
        });
        // the first table with a raw id owns it; links resolve against that one
        columnMaps.set(id, local);
        if (rawId !== undefined && !entityByRaw.has(rawId))
            entityByRaw.set(rawId, id);

        // keys
        const indexList = Array.isArray(raw.indexes) ? raw.indexes : [];
        rd.any('indexes');
        indexList.forEach((rawKey: unknown, k: number) => {
            const kpath = `${path}.indexes[${k}]`;
            if (!isRecord(rawKey)) return warn(kpath, 'not an object; skipped');
            const krd = new RecordReader(rawKey, kpath, warn);
            const id = uniqueId(krd.str('id'), keyIds, kpath, warn, random);
            const wanted = krd.strings('fieldIds') ?? [];
            const resolved: Id[] = [];
            for (const ref of wanted) {
                const target = local.get(ref);
                if (target !== undefined) resolved.push(target);
                else
                    warn(
                        kpath,
                        `index lists unknown column "${ref}"; dropped from the index`
                    );
            }
            const methodText = krd.str('type');
            const key: Key = {
                id,
                label: krd.str('name') ?? '',
                distinct: krd.bool('unique') ?? false,
                members: resolved,
                madeAt: krd.num('createdAt') ?? now,
            };
            let unknownMethod: string | undefined;
            if (methodText !== undefined) {
                if ((KEY_METHODS as readonly string[]).includes(methodText))
                    key.algorithm = methodText as KeyMethod;
                else unknownMethod = methodText;
            }
            const primary = krd.bool('isPrimaryKey');
            if (primary !== undefined) key.pk = primary;
            const desc = krd.strings('descendingFieldIds');
            if (desc) {
                const ids = desc
                    .map((ref) => local.get(ref))
                    .filter((x): x is Id => x !== undefined);
                if (ids.length > 0) key.descending = ids;
            }
            const where = krd.str('where');
            if (where !== undefined && where.trim() !== '') key.where = where;
            const keyComments = krd.str('comments');
            if (keyComments !== undefined) key.note = keyComments;
            let extra = extrasOf(krd);
            if (unknownMethod !== undefined) {
                warn(`${kpath}.type`, 'unknown index type kept as it is');
                extra = { ...extra, type: unknownMethod };
            }
            keys[id] = extra ? { ...key, extra } : key;
            entity.keyIds.push(id);
        });

        // check constraints
        const checkList = Array.isArray(raw.checkConstraints)
            ? raw.checkConstraints
            : [];
        rd.any('checkConstraints');
        checkList.forEach((rawRule: unknown, c: number) => {
            const cpath = `${path}.checkConstraints[${c}]`;
            if (!isRecord(rawRule))
                return warn(cpath, 'not an object; skipped');
            const crd = new RecordReader(rawRule, cpath, warn);
            // ids need only be unique inside their table; the model keeps one map
            const id = uniqueId(
                crd.str('id'),
                ruleIds,
                cpath,
                undefined,
                random
            );
            const rule: Rule = {
                id,
                expression: crd.str('expression') ?? '',
                createdAt: crd.num('createdAt') ?? now,
            };
            rules[id] = withExtras(rule, crd);
            entity.ruleIds.push(id);
        });

        entityRows.push({ item: withExtras(entity, rd), order });
    });

    const entities = orderEntities(entityRows);

    // ---- links
    const links: Link[] = [];
    const linkIds = new Set<Id>();
    (json.relationships as unknown[]).forEach((raw, i) => {
        const path = `relationships[${i}]`;
        if (!isRecord(raw)) return warn(path, 'not an object; skipped');
        const rd = new RecordReader(raw, path, warn);
        const sourceEntity = entityByRaw.get(rd.str('sourceTableId') ?? '');
        const targetEntity = entityByRaw.get(rd.str('targetTableId') ?? '');
        const sourceRaw = rd.str('sourceFieldId');
        const targetRaw = rd.str('targetFieldId');
        const sourceColumn =
            sourceEntity && sourceRaw
                ? columnMaps.get(sourceEntity)?.get(sourceRaw)
                : undefined;
        const targetColumn =
            targetEntity && targetRaw
                ? columnMaps.get(targetEntity)?.get(targetRaw)
                : undefined;
        if (!sourceEntity || !targetEntity || !sourceColumn || !targetColumn) {
            return warn(
                path,
                'relationship points at a table or column that does not exist; dropped'
            );
        }
        const sourceEnt = entities.find((e) => e.id === sourceEntity);
        const id = uniqueId(rd.str('id'), linkIds, path, warn, random);
        const link: Link = {
            id,
            name:
                rd.str('name') ??
                `${sourceEnt?.name ?? ''}_${columns[sourceColumn]?.name ?? ''}_fk`,
            sourceEntityId: sourceEntity,
            sourceColumnId: sourceColumn,
            targetEntityId: targetEntity,
            targetColumnId: targetColumn,
            sourceCardinality: readCardinality(
                rd,
                'sourceCardinality',
                'one',
                path,
                warn
            ),
            targetCardinality: readCardinality(
                rd,
                'targetCardinality',
                'one',
                path,
                warn
            ),
            createdAt: rd.num('createdAt') ?? now,
        };
        const sourceSchema = rd.str('sourceSchema');
        if (sourceSchema) link.sourceSchema = sourceSchema;
        const targetSchema = rd.str('targetSchema');
        if (targetSchema) link.targetSchema = targetSchema;
        links.push(withExtras(link, rd));
    });

    // ---- dependencies: carried unchanged
    const dependencies: Dependency[] = [];
    const dependencyIds = new Set<Id>();
    (json.dependencies as unknown[]).forEach((raw, i) => {
        const path = `dependencies[${i}]`;
        if (!isRecord(raw)) return warn(path, 'not an object; skipped');
        const rd = new RecordReader(raw, path, warn);
        const tableId = rd.str('tableId');
        const dependentTableId = rd.str('dependentTableId');
        if (!tableId || !dependentTableId)
            return warn(path, 'dependency lacks a table id; skipped');
        const dep: Dependency = {
            id: uniqueId(rd.str('id'), dependencyIds, path, warn, random),
            tableId,
            dependentTableId,
            createdAt: rd.num('createdAt') ?? now,
        };
        const schema = rd.str('schema');
        if (schema) dep.schema = schema;
        const dependentSchema = rd.str('dependentSchema');
        if (dependentSchema) dep.dependentSchema = dependentSchema;
        dependencies.push(withExtras(dep, rd));
    });

    const design: Design = {
        id: idText && idText.length > 0 ? idText : newDesignId(random),
        name: diagramName ?? 'Untitled',
        databaseType,
        createdAt,
        updatedAt,
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
    if (databaseEdition) design.databaseEdition = databaseEdition;
    if (designExtra) design.extra = designExtra;
    return { design, warnings };
}

function orderEntities(rows: Ranked<Entity>[]): Entity[] {
    if (rows.some((row) => row.order !== undefined)) {
        // a missing order counts as 0
        const ranked = rows
            .map((row, index) => ({ ...row, index }))
            .sort(
                (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.index - b.index
            );
        return ranked.map((row) => row.item);
    }
    // no hints at all: tables before views, then by name
    return rows
        .map((row, index) => ({ item: row.item, index }))
        .sort(
            (a, b) =>
                Number(a.item.kind === 'view') -
                    Number(b.item.kind === 'view') ||
                a.item.name.localeCompare(b.item.name) ||
                a.index - b.index
        )
        .map((row) => row.item);
}

const UNSAFE_IDS = new Set(['__proto__', 'constructor', 'prototype']);

function uniqueId(
    given: string | undefined,
    used: Set<Id>,
    path: string,
    warn: ((path: string, message: string) => void) | undefined,
    random: RandomInt | undefined
): Id {
    let id = given;
    if (id === undefined || id === '') {
        warn?.(path, 'missing id; a new one was made');
        id = undefined;
    } else if (UNSAFE_IDS.has(id)) {
        // these names would change the prototype of the id-keyed maps
        warn?.(path, `id "${id}" is not allowed; a new one was made`);
        id = undefined;
    } else if (used.has(id)) {
        warn?.(path, `id "${id}" is used twice; a new one was made`);
        id = undefined;
    }
    if (id === undefined) {
        do id = newId(random);
        while (used.has(id));
    }
    used.add(id);
    return id;
}

function readCardinality(
    rd: RecordReader,
    key: string,
    fallback: Cardinality,
    path: string,
    warn: (path: string, message: string) => void
): Cardinality {
    const value = rd.str(key);
    if (value === 'one' || value === 'many') return value;
    if (value !== undefined)
        warn(`${path}.${key}`, 'unknown cardinality; set to one');
    return fallback;
}

function readMembers(
    rd: RecordReader,
    path: string,
    warn: (path: string, message: string) => void
): CompositeMember[] | undefined {
    const value = rd.any('fields');
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
        warn(`${path}.fields`, 'expected a list; ignored');
        return undefined;
    }
    const members: CompositeMember[] = [];
    value.forEach((item, i) => {
        if (
            isRecord(item) &&
            typeof item.field === 'string' &&
            typeof item.type === 'string'
        )
            members.push({ name: item.field, type: item.type });
        else warn(`${path}.fields[${i}]`, 'expected {field, type}; skipped');
    });
    return members;
}

/** `characterMaximumLength` is text on the wire; the model holds a number or `max`. */
export function readLength(value: unknown): ColumnLength | undefined | 'bad' {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : 'bad';
    if (typeof value !== 'string') return 'bad';
    const text = value.trim();
    if (text === '' || text.toLowerCase() === 'null') return undefined;
    if (text.toLowerCase() === 'max') return 'max';
    return /^\d+$/.test(text) ? Number(text) : 'bad';
}

function readColumn(
    raw: RawRecord,
    path: string,
    index: number,
    databaseType: DatabaseType,
    now: number,
    warn: (path: string, message: string) => void,
    keep: boolean
): Column {
    const rd = new RecordReader(raw, path, warn);
    rd.any('id');
    const typeRaw = rd.any('type');
    let type: TypeRef;
    if (
        isRecord(typeRaw) &&
        (typeof typeRaw.id === 'string' || typeof typeRaw.name === 'string')
    ) {
        const name =
            typeof typeRaw.name === 'string'
                ? typeRaw.name
                : String(typeRaw.id);
        const id =
            typeof typeRaw.id === 'string'
                ? typeRaw.id
                : name.replace(/ /g, '_');
        type = { id, name };
        const typeExtra = Object.entries(typeRaw).filter(
            ([key]) => key !== 'id' && key !== 'name'
        );
        if (keep && typeExtra.length > 0)
            type.extra = Object.fromEntries(typeExtra);
    } else {
        const fallback = traitsOf(databaseType).defaultColumnType;
        warn(`${path}.type`, `missing or unreadable type; set to ${fallback}`);
        type = { id: fallback, name: fallback };
    }
    const primaryKey = rd.bool('primaryKey') ?? false;
    let nullable = rd.bool('nullable');
    if (nullable === undefined) nullable = !primaryKey;
    const column: Column = {
        id: '',
        name: rd.str('name') ?? `field_${index + 1}`,
        type,
        primaryKey,
        unique: rd.bool('unique') ?? false,
        nullable,
        createdAt: rd.num('createdAt') ?? now,
    };
    if (column.primaryKey && column.nullable) {
        column.nullable = false;
        warn(
            `${path}.nullable`,
            'a primary-key column cannot be nullable; set to not null'
        );
    }
    const increment = rd.bool('increment');
    if (increment !== undefined) column.increment = increment;
    const isArray = rd.bool('isArray');
    if (isArray !== undefined) column.isArray = isArray;
    const length = readLength(rd.any('characterMaximumLength'));
    if (length === 'bad')
        warn(`${path}.characterMaximumLength`, 'unreadable length; ignored');
    else if (length !== undefined) column.length = length;
    const precision = rd.num('precision');
    if (precision !== undefined) column.precision = precision;
    const scale = rd.num('scale');
    if (scale !== undefined) column.scale = scale;
    const text = (key: 'default' | 'collation' | 'comments' | 'check') => {
        const value = rd.str(key);
        if (value !== undefined) column[key] = value;
    };
    text('default');
    text('collation');
    text('comments');
    text('check');
    const domain = rd.str('domain');
    if (domain) column.domain = domain;
    const generatedExpression = rd.str('generatedExpression');
    const generatedStored = rd.bool('generatedStored');
    if (generatedExpression !== undefined && generatedExpression.trim() !== '')
        column.generated = {
            expression: generatedExpression,
            stored: generatedStored ?? true,
        };
    const extra = keep ? rd.extras() : undefined;
    return extra ? { ...column, extra } : column;
}
