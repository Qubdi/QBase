import type { Design } from '@/core/model/design';
import { traitsOf } from '@/core/model/database';
import { TABLE_WIDTH } from '@/core/model/entity';
import { listOf } from '@/core/model/collection';

/** Space between the existing tables and the imported ones, in pixels (IMP-075). */
export const IMPORT_GAP = 150;

export interface MergeResult {
    design: Design;
    addedEntities: number;
    addedLinks: number;
    addedTypes: number;
    /** names of imported tables that already exist (IMP-076 asks for a warning) */
    duplicates: string[];
}

/** A table without a schema counts as being in the database's default one. */
const keyIn =
    (defaultSchema: string | undefined) =>
    (schema: string | undefined, name: string): string =>
        `${(schema || defaultSchema || '').toLowerCase()}\u0000${name.toLowerCase()}`;

/**
 * Adds what an import built to an open design. Imported tables are moved so
 * the left-most one sits 150 px right of the right-most existing table; ids
 * are already fresh. Nothing is merged: a table that exists again becomes a
 * second table and is reported in `duplicates`. A generic design takes the
 * imported database type. Custom types that are not there yet are added.
 */
export function mergeImported(
    current: Design,
    imported: Design,
    now: number
): MergeResult {
    const nameKey = keyIn(traitsOf(current.databaseType).defaultSchema);
    const existing = listOf(current.entities);
    const incoming = listOf(imported.entities);
    const right = existing.length
        ? Math.max(
              ...existing.map((e) => e.x + (e.width ?? TABLE_WIDTH.default))
          )
        : 0;
    const left = incoming.length ? Math.min(...incoming.map((e) => e.x)) : 0;
    const dx = existing.length ? right + IMPORT_GAP - left : 0;

    const taken = new Set(existing.map((e) => nameKey(e.schema, e.name)));
    const duplicates = incoming
        .filter((e) => taken.has(nameKey(e.schema, e.name)))
        .map((e) => (e.schema ? `${e.schema}.${e.name}` : e.name));

    const entities = {
        byId: { ...current.entities.byId },
        order: [...current.entities.order],
    };
    for (const e of incoming) {
        entities.byId[e.id] = { ...e, x: e.x + dx, regionId: undefined };
        entities.order.push(e.id);
    }

    const links = {
        byId: { ...current.links.byId },
        order: [...current.links.order],
    };
    for (const l of listOf(imported.links)) {
        links.byId[l.id] = l;
        links.order.push(l.id);
    }

    const haveType = new Set(
        listOf(current.userTypes).map((t) => nameKey(t.schema, t.name))
    );
    const userTypes = {
        byId: { ...current.userTypes.byId },
        order: [...current.userTypes.order],
    };
    let addedTypes = 0;
    for (const t of listOf(imported.userTypes)) {
        if (haveType.has(nameKey(t.schema, t.name))) continue;
        userTypes.byId[t.id] = t;
        userTypes.order.push(t.id);
        addedTypes += 1;
    }

    const design: Design = {
        ...current,
        ...(current.databaseType === 'generic'
            ? {
                  databaseType: imported.databaseType,
                  databaseEdition: imported.databaseEdition,
              }
            : {}),
        entities,
        columns: { ...current.columns, ...imported.columns },
        keys: { ...current.keys, ...imported.keys },
        rules: { ...current.rules, ...imported.rules },
        links,
        userTypes,
        dependencies: [...current.dependencies, ...imported.dependencies],
        updatedAt: now,
    };
    return {
        design,
        addedEntities: incoming.length,
        addedLinks: imported.links.order.length,
        addedTypes,
        duplicates,
    };
}
