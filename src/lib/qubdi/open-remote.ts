import { diagramSchema, type Diagram } from '@/lib/domain/diagram';
import { findLocalId, setProjectId, setRemoteId } from './remote-map';
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

/** A viewer cannot open a diagram until an editor has published it. */
export class UnpublishedDiagramError extends Error {
    constructor() {
        super(
            'This diagram has not been published yet. Ask an editor to publish it.'
        );
    }
}

export interface EnsureLocalCopyArgs {
    remoteId: string;
    projectId: string;
    /** ids of the diagrams already stored in this browser */
    localIds: ReadonlySet<string>;
    fetchRemote: (
        remoteId: string
    ) => Promise<{ title: string; content: Record<string, unknown> | null }>;
    addDiagram: (diagram: Diagram) => Promise<void>;
    newId: () => string;
}

/**
 * The editor works on a copy kept in the browser. This returns the local id
 * of the copy for a server diagram, creating the copy on the first visit.
 */
export async function ensureLocalCopy(
    args: EnsureLocalCopyArgs
): Promise<{ localId: string; created: boolean }> {
    const existing = findLocalId(args.remoteId);
    if (existing && args.localIds.has(existing)) {
        setProjectId(existing, args.projectId);
        return { localId: existing, created: false };
    }
    const remote = await args.fetchRemote(args.remoteId);
    if (!remote.content) throw new UnpublishedDiagramError();
    const localId = args.newId();
    const diagram = serverContentToDiagram(remote.content, {
        localId,
        name: remote.title,
    });
    await args.addDiagram(diagram);
    setRemoteId(localId, args.remoteId);
    setProjectId(localId, args.projectId);
    return { localId, created: true };
}
