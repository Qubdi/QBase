import { diagramSchema, type Diagram } from '@/lib/domain/diagram';
import type { MyProject, RemoteDiagramSummary } from './api';

export interface DiagramGroup {
    /** null for diagrams that belong to no project */
    projectId: string | null;
    label: string;
    description: string;
    diagrams: RemoteDiagramSummary[];
}

export const PERSONAL_LABEL = 'Personal';

/**
 * Groups the diagrams a user can reach by project. Every project they belong
 * to is listed, even an empty one, so they can see where to save into.
 * Personal (project-less) diagrams come last.
 */
export function groupByProject(
    diagrams: RemoteDiagramSummary[],
    projects: MyProject[]
): DiagramGroup[] {
    const groups: DiagramGroup[] = projects
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({
            projectId: p.id,
            label: p.name,
            description: p.description,
            diagrams: [],
        }));
    const byId = new Map(groups.map((g) => [g.projectId, g]));
    const personal: DiagramGroup = {
        projectId: null,
        label: PERSONAL_LABEL,
        description: '',
        diagrams: [],
    };
    for (const d of diagrams) {
        const target = (d.projectId && byId.get(d.projectId)) || personal;
        target.diagrams.push(d);
    }
    for (const g of [...groups, personal]) {
        g.diagrams.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    return personal.diagrams.length > 0 ? [...groups, personal] : groups;
}

/** Case-insensitive filter on diagram title; groups left empty are dropped. */
export function filterGroups(
    groups: DiagramGroup[],
    query: string
): DiagramGroup[] {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
        .map((g) => ({
            ...g,
            diagrams: g.diagrams.filter((d) =>
                d.title.toLowerCase().includes(q)
            ),
        }))
        .filter((g) => g.diagrams.length > 0);
}

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
