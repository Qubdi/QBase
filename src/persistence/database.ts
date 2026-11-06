import Dexie from 'dexie';
import type { DexieOptions, Table } from 'dexie';
import { declareLegacyVersions } from './legacy-schema';

export const DATABASE_NAME = 'QBase';
export const PREVIOUS_DATABASE_NAME = 'QubdiDB';

/** A saved design: the whole serialised diagram in one record. */
export interface DesignRecord {
    id: string;
    /** the wire JSON (see core/wire/serialise) */
    doc: Record<string, unknown>;
}

/** The list index: what the list screens need, without loading `doc`. */
export interface IndexRecord {
    id: string;
    name: string;
    databaseType: string;
    databaseEdition?: string;
    createdAt: number;
    updatedAt: number;
    tableCount: number;
    linkCount: number;
}

export interface MetaRecord {
    key: string;
    value: unknown;
}

export interface ConfigRecord {
    id: number;
    defaultDiagramId: string;
    exportActions?: Date[];
}

export interface FilterRecord {
    diagramId: string;
    schemaIds?: string[];
    tableIds?: string[];
}

type Row = Record<string, unknown>;

/**
 * The browser database `QBase`. Versions 1 to 14 are the old nine-store
 * layout (kept so older browser data upgrades and nothing fails to open);
 * version 15 adds the new layout: one record per design plus a list index.
 */
export class QBaseDatabase extends Dexie {
    designs!: Table<DesignRecord, string>;
    design_index!: Table<IndexRecord, string>;
    meta!: Table<MetaRecord, string>;
    config!: Table<ConfigRecord, number>;
    diagram_filters!: Table<FilterRecord, string>;
    // old layout, read once by the migration
    diagrams!: Table<Row, string>;
    db_tables!: Table<Row, string>;
    db_relationships!: Table<Row, string>;
    db_dependencies!: Table<Row, string>;
    areas!: Table<Row, string>;
    db_custom_types!: Table<Row, string>;
    notes!: Table<Row, string>;

    constructor(name = DATABASE_NAME, options?: DexieOptions) {
        super(name, options);
        declareLegacyVersions(this);
        this.version(15).stores({
            designs: 'id',
            design_index: 'id, name, updatedAt',
            meta: 'key',
        });
    }
}

/** A database with only the old layout: how `QubdiDB` is opened for the merge. */
export function createLegacyDatabase(
    name: string,
    options?: DexieOptions
): Dexie {
    const db = new Dexie(name, options);
    declareLegacyVersions(db);
    return db;
}

type Factory = {
    databases?: () => Promise<{ name?: string }[]>;
};

/** True when a browser database of that name exists. */
export async function databaseExists(
    name: string,
    options?: DexieOptions
): Promise<boolean> {
    const factory = (options?.indexedDB ??
        (globalThis as { indexedDB?: unknown }).indexedDB) as
        Factory | undefined;
    if (!factory) return false;
    if (typeof factory.databases === 'function') {
        const all = await factory.databases();
        return all.some((db) => db.name === name);
    }
    return Dexie.exists(name);
}

/** Deletes a browser database (used when signing out). */
export async function deleteDatabase(
    name: string,
    options?: DexieOptions
): Promise<void> {
    if (!(await databaseExists(name, options))) return;
    await new Dexie(name, options).delete();
}
