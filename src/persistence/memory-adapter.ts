import type { Design } from '../core/model/design';
import type { VisibilityFilter } from '../core/model/visibility-filter';
import { parse } from '../core/wire/parse';
import { serialise } from '../core/wire/serialise';
import { summaryOf } from './storage-adapter';
import type {
    DiagramSummary,
    LoadedDesign,
    LocalSettings,
    StorageAdapter,
} from './storage-adapter';

/**
 * An adapter that keeps everything in memory. Used when the browser blocks
 * IndexedDB, so the editor still opens with defaults (DAT-018); nothing
 * survives a reload.
 */
export class MemoryStorageAdapter implements StorageAdapter {
    private readonly docs = new Map<string, Record<string, unknown>>();
    private readonly index = new Map<string, DiagramSummary>();
    private readonly filters = new Map<string, VisibilityFilter>();
    private settings: LocalSettings = { defaultDiagramId: '' };
    private readonly listeners = new Set<() => void>();
    private readonly removed = new Set<string>();

    private changed(): void {
        for (const listener of [...this.listeners]) listener();
    }

    async list(): Promise<DiagramSummary[]> {
        return [...this.index.values()].sort(
            (a, b) => b.updatedAt - a.updatedAt
        );
    }

    async load(id: string): Promise<LoadedDesign | undefined> {
        const doc = this.docs.get(id);
        return doc ? parse(doc) : undefined;
    }

    async save(design: Design, options?: { update?: boolean }): Promise<void> {
        if (options?.update) {
            if (this.removed.has(design.id)) return;
        } else this.removed.delete(design.id);
        this.docs.set(design.id, JSON.parse(JSON.stringify(serialise(design))));
        this.index.set(design.id, summaryOf(design));
        this.changed();
    }

    wasRemoved(id: string): boolean {
        return this.removed.has(id);
    }

    async remove(id: string): Promise<void> {
        this.removed.add(id);
        this.docs.delete(id);
        this.index.delete(id);
        this.filters.delete(id);
        if (this.settings.defaultDiagramId === id)
            this.settings = { ...this.settings, defaultDiagramId: '' };
        this.changed();
    }

    async readSettings(): Promise<LocalSettings> {
        return { ...this.settings };
    }

    async writeSettings(patch: Partial<LocalSettings>): Promise<void> {
        this.settings = { ...this.settings, ...patch };
    }

    async readFilter(diagramId: string): Promise<VisibilityFilter | undefined> {
        const filter = this.filters.get(diagramId);
        return filter ? { ...filter } : undefined;
    }

    async writeFilter(
        diagramId: string,
        filter: VisibilityFilter
    ): Promise<void> {
        this.filters.set(diagramId, { ...filter });
    }

    onChange(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}
