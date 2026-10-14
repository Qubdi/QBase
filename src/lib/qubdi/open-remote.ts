import { diagramSchema, type Diagram } from '@/lib/domain/diagram';
export class InvalidServerDiagramError extends Error {
    constructor() {
        super('The server copy of this diagram could not be read.');
    }
}

/**
 * Turns the JSON the server stores back into a local diagram. Dates travel as
 * ISO strings, so they are revived before validating. A fresh local id keeps
 * the copy from colliding with a diagram the user already has.
 */
export function serverContentToDiagram(
    content: Record<string, unknown> | null,
    options: { localId: string; name?: string }
): Diagram {
    if (!content) throw new InvalidServerDiagramError();
    const revive = (v: unknown, fallback: Date) => {
        const d = new Date(
            typeof v === 'string' || typeof v === 'number' ? v : NaN
        );
        return Number.isNaN(d.getTime()) ? fallback : d;
    };
    const now = new Date();
    const parsed = diagramSchema.safeParse({
        ...content,
        id: options.localId,
        name: options.name ?? content.name,
        createdAt: revive(content.createdAt, now),
        updatedAt: revive(content.updatedAt, now),
    });
    if (!parsed.success) throw new InvalidServerDiagramError();
    return parsed.data;
}
