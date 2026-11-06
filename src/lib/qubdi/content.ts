import type { Diagram } from '@/qbase/diagram-types';

/**
 * Serializes a local diagram for the server, keeping every id as-is.
 *
 * Do not use the export helpers here: they renumber ids (0, 1, 2, ...) for
 * portable files, which would break re-sync and drift detection that
 * all rely on ids staying stable between the editor and the server.
 */
export function diagramToServerContent(
    diagram: Diagram
): Record<string, unknown> {
    // JSON round trip drops undefined values and turns Dates into ISO strings
    return JSON.parse(JSON.stringify(diagram)) as Record<string, unknown>;
}
