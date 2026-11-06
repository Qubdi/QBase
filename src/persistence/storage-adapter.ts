import type { Design } from '../core/model/design';
import type { DatabaseEdition, DatabaseType } from '../core/model/database';
import type { VisibilityFilter } from '../core/model/visibility-filter';
import type { WireWarning } from '../core/wire/warning';

/** One row of the diagram list: enough to draw it without loading the diagram. */
export interface DiagramSummary {
    id: string;
    name: string;
    databaseType: DatabaseType;
    databaseEdition?: DatabaseEdition;
    /** ms */
    createdAt: number;
    /** ms */
    updatedAt: number;
    tableCount: number;
    linkCount: number;
}

export interface LoadedDesign {
    design: Design;
    /** repairs made while reading; shown once */
    warnings: WireWarning[];
}

/** Browser-local settings that are not part of any diagram (data-format 3.13). */
export interface LocalSettings {
    /** the diagram the editor opens by default; may be empty */
    defaultDiagramId: string;
    /** dates of past exports */
    exportActions?: Date[];
}

/**
 * Where designs live. One record per design, plus a list index. Every load
 * goes through the tolerant wire parse; every save through serialise.
 */
export interface StorageAdapter {
    /** newest change first */
    list(): Promise<DiagramSummary[]>;
    load(id: string): Promise<LoadedDesign | undefined>;
    /** adds or replaces the design with the same id */
    save(design: Design): Promise<void>;
    /** removes the design, its saved filter and any old-layout rows it still has */
    remove(id: string): Promise<void>;
    readSettings(): Promise<LocalSettings>;
    writeSettings(patch: Partial<LocalSettings>): Promise<void>;
    /** the saved visibility filter of a design, if any */
    readFilter(diagramId: string): Promise<VisibilityFilter | undefined>;
    writeFilter(diagramId: string, filter: VisibilityFilter): Promise<void>;
    /** called after the list changes, also when another tab made the change */
    onChange(listener: () => void): () => void;
}

export function summaryOf(design: Design): DiagramSummary {
    return {
        id: design.id,
        name: design.name,
        databaseType: design.databaseType,
        ...(design.databaseEdition
            ? { databaseEdition: design.databaseEdition }
            : {}),
        createdAt: design.createdAt,
        updatedAt: design.updatedAt,
        tableCount: design.entities.order.length,
        linkCount: design.links.order.length,
    };
}
