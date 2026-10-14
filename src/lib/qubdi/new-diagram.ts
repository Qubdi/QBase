import type { DatabaseType } from '@/lib/domain/database-type';
import type { Diagram } from '@/lib/domain/diagram';

export const DEFAULT_DIAGRAM_NAME = 'Untitled diagram';

/** A blank diagram, ready to be created inside a project. */
export function emptyDiagram(options: {
    id: string;
    name: string;
    databaseType: DatabaseType;
    now?: Date;
}): Diagram {
    const now = options.now ?? new Date();
    return {
        id: options.id,
        name: options.name.trim() || DEFAULT_DIAGRAM_NAME,
        databaseType: options.databaseType,
        tables: [],
        relationships: [],
        dependencies: [],
        areas: [],
        customTypes: [],
        notes: [],
        createdAt: now,
        updatedAt: now,
    };
}
