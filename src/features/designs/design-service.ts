import { createDesign } from '@/core/model/defaults';
import type { DatabaseEdition, DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import { newDesignId, newId } from '@/core/model/ids';
import { relabel } from '@/core/wire/relabel';
import type { StorageAdapter } from '@/persistence/storage-adapter';

/** Plain functions over the storage adapter: the designs feature's whole write side. */

export interface NewDesignOptions {
    databaseType: DatabaseType;
    databaseEdition?: DatabaseEdition;
    /** blank gets `defaultName` */
    name?: string;
    defaultName: string;
    now?: number;
}

/** Saves a blank design and makes it the one the editor opens next time. */
export async function createBlankDesign(
    adapter: StorageAdapter,
    options: NewDesignOptions
): Promise<Design> {
    const design = createDesign({
        name: options.name,
        defaultName: options.defaultName,
        databaseType: options.databaseType,
        databaseEdition: options.databaseEdition,
        now: options.now,
    });
    await adapter.save(design);
    await adapter.writeSettings({ defaultDiagramId: design.id });
    return design;
}

/** Stores a design that was built elsewhere (an import) and makes it the default. */
export async function storeNewDesign(
    adapter: StorageAdapter,
    design: Design
): Promise<void> {
    await adapter.save(design);
    await adapter.writeSettings({ defaultDiagramId: design.id });
}

/** "Diagram 4" when three diagrams exist (spec A5). */
export const nextNumber = (count: number): number => count + 1;

/** A copy with fresh ids named "<name> (Copy)"; the original stays as it is. */
export async function duplicateDesign(
    adapter: StorageAdapter,
    id: string,
    copySuffix: string,
    now = Date.now()
): Promise<Design | undefined> {
    const loaded = await adapter.load(id);
    if (!loaded) return undefined;
    const fresh = relabel(loaded.design, (kind) =>
        kind === 'design' ? newDesignId() : newId()
    );
    const copy: Design = {
        ...fresh,
        name: `${loaded.design.name} ${copySuffix}`,
        createdAt: now,
        updatedAt: now,
    };
    await adapter.save(copy);
    return copy;
}

/** Renames a stored design; a blank name is ignored. Returns whether it changed. */
export async function renameStoredDesign(
    adapter: StorageAdapter,
    id: string,
    name: string,
    now = Date.now()
): Promise<boolean> {
    const trimmed = name.trim();
    if (trimmed === '') return false;
    const loaded = await adapter.load(id);
    if (!loaded || loaded.design.name === trimmed) return false;
    await adapter.save({ ...loaded.design, name: trimmed, updatedAt: now });
    return true;
}

/** Removes a design; clears the default when it pointed at it. Returns how many remain. */
export async function removeStoredDesign(
    adapter: StorageAdapter,
    id: string
): Promise<number> {
    await adapter.remove(id);
    const settings = await adapter.readSettings();
    if (settings.defaultDiagramId === id)
        await adapter.writeSettings({ defaultDiagramId: '' });
    return (await adapter.list()).length;
}

/** Remembers which design the editor opens by default (spec A3 step 5). */
export async function rememberDefault(
    adapter: StorageAdapter,
    id: string
): Promise<void> {
    await adapter.writeSettings({ defaultDiagramId: id });
}
