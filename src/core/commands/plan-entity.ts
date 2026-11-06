import { newId } from '../model/ids';
import type { RandomInt } from '../model/ids';
import { createEntityParts, schemaForNewEntity } from '../model/defaults';
import type { NewEntityOptions } from '../model/defaults';
import { traitsOf } from '../model/database';
import type { Design } from '../model/design';
import { TABLE_WIDTH } from '../model/entity';
import type { EntityParts } from '../model/entity-parts';
import type { Id } from '../model/id';
import { entityOf, partsOf } from '../model/lookup';
import type { Command } from './command';

export interface PlanOptions {
    now?: number;
    random?: RandomInt;
}

/**
 * Adds a table or view at the end of the list (DAT-026, EDT-075). The schema
 * is taken from `visibleSchemas` as the editor does (14.2) unless given.
 */
export function planAddEntity(
    design: Design,
    options: NewEntityOptions & { visibleSchemas?: readonly string[] } = {}
): Command {
    const schema =
        options.schema ??
        schemaForNewEntity(design.databaseType, options.visibleSchemas);
    const parts = createEntityParts(design, { ...options, schema });
    return { type: 'entity.insert', parts };
}

/** Deletes tables with their links and dependencies, as one step (EDT-100). */
export function planDeleteEntities(ids: readonly Id[]): Command {
    return {
        type: 'group',
        label: 'delete tables',
        commands: ids.map((id) => ({ type: 'entity.remove', id })),
    };
}

/** Changes the schema of one table only (EDT-101 change). */
export function planChangeSchema(
    entityId: Id,
    schema: string | undefined
): Command {
    return { type: 'entity.update', id: entityId, patch: { schema } };
}

/** A copy of an entity's records under new ids; keys are remapped. */
function cloneParts(
    source: EntityParts,
    now: number,
    random: RandomInt | undefined
): EntityParts {
    const columnIds = new Map<Id, Id>();
    const columns = source.columns.map((column) => {
        const id = newId(random);
        columnIds.set(column.id, id);
        return { ...column, id };
    });
    const keys = source.keys.map((key) => ({
        ...key,
        id: newId(random),
        // the primary-key index of a copy has no name of its own
        ...(key.pk ? { label: '' } : {}),
        members: key.members.map((c) => columnIds.get(c) ?? c),
    }));
    const rules = source.rules.map((rule) => ({ ...rule, id: newId(random) }));
    return {
        entity: {
            ...source.entity,
            id: newId(random),
            createdAt: now,
            columnIds: columns.map((c) => c.id),
            keyIds: keys.map((k) => k.id),
            ruleIds: rules.map((r) => r.id),
        },
        columns,
        keys,
        rules,
    };
}

/**
 * Duplicates a table (EDT-099): new ids, `_copy` added to the name, moved 30
 * px right and 50 px down, columns and indexes copied, no links.
 */
export function planDuplicateEntity(
    design: Design,
    id: Id,
    options: PlanOptions = {}
): Command | undefined {
    const entity = entityOf(design, id);
    if (!entity) return undefined;
    const copy = cloneParts(
        partsOf(design, entity),
        options.now ?? Date.now(),
        options.random
    );
    copy.entity = {
        ...copy.entity,
        name: `${entity.name}_copy`,
        x: entity.x + 30,
        y: entity.y + 50,
    };
    return { type: 'entity.insert', parts: copy };
}

/** What Mod+C remembers: snapshots of the chosen tables (the clipboard is the store's). */
export interface Clip {
    entities: EntityParts[];
}

export function makeClip(design: Design, ids: readonly Id[]): Clip {
    const entities: EntityParts[] = [];
    for (const id of ids) {
        const entity = entityOf(design, id);
        if (entity) entities.push(partsOf(design, entity));
    }
    return { entities };
}

function nameTaken(
    taken: Map<string, Set<string>>,
    schema: string | undefined,
    name: string
): boolean {
    return taken.get(schema ?? '')?.has(name.toLowerCase()) ?? false;
}

/**
 * Pastes a clip (EDT-230 to EDT-234). Names stay if free in their schema,
 * else `_copy`, `_copy2`, ... (case-insensitive). The group moves right by its
 * own width plus 40 px; paste number `pasteIndex` (0 for the first) goes one
 * further slot right each time. Schema is kept only for databases with
 * schemas; the area only if it exists here. No links or dependencies.
 * Returns undefined for an empty clip.
 */
export function planPaste(
    design: Design,
    clip: Clip,
    pasteIndex = 0,
    options: PlanOptions = {}
): Command | undefined {
    if (clip.entities.length === 0) return undefined;
    const now = options.now ?? Date.now();
    const hasSchemas = traitsOf(design.databaseType).hasSchemas;

    const taken = new Map<string, Set<string>>();
    for (const id of design.entities.order) {
        const e = design.entities.byId[id];
        const bucket = taken.get(e.schema ?? '') ?? new Set<string>();
        bucket.add(e.name.toLowerCase());
        taken.set(e.schema ?? '', bucket);
    }

    const left = Math.min(...clip.entities.map((p) => p.entity.x));
    const right = Math.max(
        ...clip.entities.map(
            (p) => p.entity.x + (p.entity.width ?? TABLE_WIDTH.default)
        )
    );
    const shift = (right - left + 40) * (pasteIndex + 1);

    const commands: Command[] = clip.entities.map((source) => {
        const copy = cloneParts(source, now, options.random);
        const schema = hasSchemas ? source.entity.schema : undefined;
        let name = source.entity.name;
        if (nameTaken(taken, schema, name)) {
            name = `${source.entity.name}_copy`;
            for (let n = 2; nameTaken(taken, schema, name); n++)
                name = `${source.entity.name}_copy${n}`;
        }
        const bucket = taken.get(schema ?? '') ?? new Set<string>();
        bucket.add(name.toLowerCase());
        taken.set(schema ?? '', bucket);

        const entity = { ...copy.entity, name, x: source.entity.x + shift };
        if (schema === undefined) delete entity.schema;
        else entity.schema = schema;
        if (
            entity.regionId !== undefined &&
            !Object.hasOwn(design.regions.byId, entity.regionId)
        )
            delete entity.regionId;
        return { type: 'entity.insert', parts: { ...copy, entity } };
    });
    return { type: 'group', label: 'paste', commands };
}
