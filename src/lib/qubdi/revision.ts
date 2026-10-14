import type { Diagram } from '@/lib/domain/diagram';

/** The parts of a diagram that are saved to the server. */
const savedParts = (d: Diagram): unknown[] => [
    d.name,
    d.databaseType,
    d.databaseEdition,
    d.tables,
    d.relationships,
    d.dependencies,
    d.areas,
    d.customTypes,
    d.notes,
];

/**
 * Counts how many times the saved content changed, by comparing references
 * instead of serialising the diagram. Editing replaces the changed array, so
 * an untouched diagram keeps its number. `updatedAt` is ignored: it moves with
 * every edit and says nothing the content does not.
 */
export function createRevisionTracker(): (diagram: Diagram) => number {
    let previous: unknown[] | null = null;
    let revision = 0;
    return (diagram) => {
        const parts = savedParts(diagram);
        if (previous && parts.every((p, i) => Object.is(p, previous![i]))) {
            return revision;
        }
        previous = parts;
        return ++revision;
    };
}
