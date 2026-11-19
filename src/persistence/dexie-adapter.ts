import type { DexieOptions } from 'dexie';
import type { Design } from '../core/model/design';
import type { VisibilityFilter } from '../core/model/visibility-filter';
import { parse } from '../core/wire/parse';
import { serialise } from '../core/wire/serialise';
import { QBaseDatabase } from './database';
import { LEGACY_CHILD_STORES } from './legacy-schema';
import { mergePreviousDatabase } from './merge-previous';
import { clearPendingCopy } from './pending-copy';
import { MIGRATION_MARKER, migrateLegacyLayout } from './migrate-legacy';
import type { MigrationReport } from './migrate-legacy';
import { summaryOf } from './storage-adapter';
import type {
    DiagramSummary,
    LoadedDesign,
    LocalSettings,
    StorageAdapter,
} from './storage-adapter';

const CONFIG_ID = 1;

/** The adapter over the `QBase` IndexedDB database (Dexie). */
export class DexieStorageAdapter implements StorageAdapter {
    private readonly listeners = new Set<() => void>();
    private channel: BroadcastChannel | undefined;

    constructor(readonly db: QBaseDatabase) {}

    private get channelName(): string {
        return `qbase-storage:${this.db.name}`;
    }

    /** tell this tab's listeners and every other tab that the list changed */
    private announce(): void {
        for (const listener of [...this.listeners]) listener();
        try {
            // a channel does not hear its own posts, but a second channel of
            // this tab would: post on the listening one so the tab is told once
            const channel =
                this.channel ?? new BroadcastChannel(this.channelName);
            channel.postMessage('changed');
            if (channel !== this.channel) channel.close();
        } catch {
            // no cross-tab channel in this browser: only this tab is told
        }
    }

    /** closes the database and the cross-tab channel */
    close(): void {
        this.channel?.close();
        this.channel = undefined;
        this.db.close();
    }

    async list(): Promise<DiagramSummary[]> {
        const rows = await this.db.design_index
            .orderBy('updatedAt')
            .reverse()
            .toArray();
        return rows.map((row) => ({ ...row }) as DiagramSummary);
    }

    async load(id: string): Promise<LoadedDesign | undefined> {
        const record = await this.db.designs.get(id);
        if (!record) return undefined;
        return parse(record.doc);
    }

    async save(design: Design, options?: { update?: boolean }): Promise<void> {
        // only an explicit create brings a deleted id back; an autosave that
        // was already in flight must not
        if (!options?.update) this.removed.delete(design.id);
        let written = false;
        await this.db.transaction(
            'rw',
            [this.db.designs, this.db.design_index],
            async () => {
                if (options?.update) {
                    // the row is shared by every tab: if another tab deleted
                    // the design, it is gone here and stays gone
                    if (this.removed.has(design.id)) return;
                    if (!(await this.db.designs.get(design.id))) return;
                }
                written = true;
                await this.db.designs.put({
                    id: design.id,
                    doc: serialise(design),
                });
                await this.db.design_index.put(summaryOf(design));
            }
        );
        if (written) this.announce();
    }

    private readonly removed = new Set<string>();

    wasRemoved(id: string): boolean {
        return this.removed.has(id);
    }

    async remove(id: string): Promise<void> {
        this.removed.add(id);
        // a copy kept as the page was left must not bring it back, or sit there for ever
        clearPendingCopy(id);
        const db = this.db;
        await db.transaction(
            'rw',
            [
                db.designs,
                db.design_index,
                db.diagram_filters,
                db.config,
                db.diagrams,
                ...LEGACY_CHILD_STORES.map((name) => db.table(name)),
            ],
            async () => {
                await db.designs.delete(id);
                await db.design_index.delete(id);
                await db.diagram_filters.delete(id);
                // rows the old layout still holds for it must not come back
                await db.diagrams.delete(id);
                for (const name of LEGACY_CHILD_STORES)
                    await db.table(name).where('diagramId').equals(id).delete();
                const config = await db.config.get(CONFIG_ID);
                if (config && config.defaultDiagramId === id)
                    await db.config.put({ ...config, defaultDiagramId: '' });
            }
        );
        this.announce();
    }

    async readSettings(): Promise<LocalSettings> {
        const row = await this.db.config.get(CONFIG_ID);
        return {
            defaultDiagramId: row?.defaultDiagramId ?? '',
            ...(row?.exportActions ? { exportActions: row.exportActions } : {}),
        };
    }

    async writeSettings(patch: Partial<LocalSettings>): Promise<void> {
        // read and write in one transaction: two tabs patching at once must
        // not each overwrite the other's change
        await this.db.transaction('rw', this.db.config, async () => {
            const current = await this.db.config.get(CONFIG_ID);
            await this.db.config.put({
                ...(current ?? { defaultDiagramId: '' }),
                ...patch,
                id: CONFIG_ID,
            });
        });
    }

    async readFilter(diagramId: string): Promise<VisibilityFilter | undefined> {
        const row = await this.db.diagram_filters.get(diagramId);
        if (!row) return undefined;
        const filter: VisibilityFilter = {};
        if (Array.isArray(row.schemaIds)) filter.schemaIds = row.schemaIds;
        if (Array.isArray(row.tableIds)) filter.tableIds = row.tableIds;
        return filter;
    }

    async writeFilter(
        diagramId: string,
        filter: VisibilityFilter
    ): Promise<void> {
        await this.db.diagram_filters.put({
            diagramId,
            ...(filter.schemaIds ? { schemaIds: filter.schemaIds } : {}),
            ...(filter.tableIds ? { tableIds: filter.tableIds } : {}),
        });
    }

    onChange(listener: () => void): () => void {
        this.listeners.add(listener);
        if (!this.channel) {
            try {
                this.channel = new BroadcastChannel(this.channelName);
                this.channel.onmessage = () => {
                    for (const each of [...this.listeners]) each();
                };
            } catch {
                this.channel = undefined;
            }
        }
        return () => {
            this.listeners.delete(listener);
            if (this.listeners.size === 0) {
                this.channel?.close();
                this.channel = undefined;
            }
        };
    }
}

export interface OpenResult {
    adapter: DexieStorageAdapter;
    /** what the one-time move of the old layout did */
    migration: MigrationReport;
}

/**
 * Opens `QBase` and brings it up to date, in the order the spec fixes: merge
 * the earlier `QubdiDB` first, then move the old layout to the new one, then
 * make sure the config row exists (data-format 2.4).
 */
export async function openDexieStorage(
    options: DexieOptions & {
        name?: string;
        warn?: (message: string, error: unknown) => void;
        now?: number;
    } = {}
): Promise<OpenResult> {
    const { name, warn, now, ...dexieOptions } = options;
    const db = new QBaseDatabase(name, dexieOptions);
    await db.open();
    const merged = await mergePreviousDatabase(db, dexieOptions, warn);
    // rows the merge just copied are in the old layout even when the marker
    // says the migration ran earlier: run it again (it skips what is there)
    if (merged === 'merged') await db.meta.delete(MIGRATION_MARKER);
    const migration = await migrateLegacyLayout(db, now);
    if ((await db.config.get(CONFIG_ID)) === undefined) {
        const first = await db.design_index.orderBy('id').first();
        await db.config.put({
            id: CONFIG_ID,
            defaultDiagramId: first?.id ?? '',
        });
    }
    return { adapter: new DexieStorageAdapter(db), migration };
}
