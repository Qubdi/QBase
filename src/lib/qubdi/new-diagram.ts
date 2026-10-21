import { i18n } from '@/i18n/i18n';
import type { DatabaseType } from '@/lib/domain/database-type';
import type { Diagram } from '@/lib/domain/diagram';

/** The name a blank diagram gets, in the current language. */
export const defaultDiagramName = (): string =>
    i18n.t('qubdi.workspace.newDiagram.defaultName');

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
        name: options.name.trim() || defaultDiagramName(),
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
