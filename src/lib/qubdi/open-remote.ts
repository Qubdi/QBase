import { diagramSchema } from '@/qbase/diagram-convert';
import type { Diagram } from '@/qbase/diagram-types';
import { findLocalId, setProjectId, setRemoteId } from './remote-map';
import { diagramToServerContent } from './content';
import { getBaseUpdatedAt, setBaseUpdatedAt } from './remote-version';
import { markSyncedContent, matchesSyncedContent } from './sent-content';
import { adoptHandedOffSyncState } from './sync-state';
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
    fetchRemote: (remoteId: string) => Promise<{
        title: string;
        content: Record<string, unknown> | null;
        updatedAt?: string;
    }>;
    addDiagram: (diagram: Diagram) => Promise<void>;
    newId: () => string;
    /**
     * What a reopen needs to bring a copy up to date. `serverUpdatedAt` is the
     * server's `updatedAt` for the diagram (from the list). A copy is replaced
     * only when it is behind the server and holds nothing the server lacks:
     * a viewer's copy never does, an editor's only when it still equals what
     * it last had in common with the server.
     */
    refresh?: {
        serverUpdatedAt: string;
        /** the viewer cannot edit the copy, so it has no unsent changes */
        readOnly: boolean;
        getLocal: (localId: string) => Promise<Diagram | undefined>;
        deleteLocal: (localId: string) => Promise<void>;
    };
}

/** True when the local copy has nothing the server does not already have. */
async function isClean(
    localId: string,
    refresh: NonNullable<EnsureLocalCopyArgs['refresh']>
): Promise<boolean> {
    if (refresh.readOnly) return true;
    const local = await refresh.getLocal(localId);
    return (
        !!local &&
        matchesSyncedContent(localId, diagramToServerContent(local)) === true
    );
}

/**
 * The editor works on a copy kept in the browser. This returns the local id
 * of the copy for a server diagram, creating the copy on the first visit and
 * bringing it up to date on later ones when that loses nothing.
 */
export async function ensureLocalCopy(
    args: EnsureLocalCopyArgs
): Promise<{ localId: string; created: boolean; refreshed?: boolean }> {
    const existing = findLocalId(args.remoteId);
    if (existing && args.localIds.has(existing)) {
        setProjectId(existing, args.projectId);
        const { refresh } = args;
        const base = getBaseUpdatedAt(existing);
        if (
            refresh &&
            base !== undefined &&
            refresh.serverUpdatedAt !== base &&
            (await isClean(existing, refresh))
        ) {
            const remote = await args.fetchRemote(args.remoteId);
            if (remote.content) {
                const diagram = serverContentToDiagram(remote.content, {
                    localId: existing,
                    name: remote.title,
                });
                await refresh.deleteLocal(existing);
                await args.addDiagram(diagram);
                setBaseUpdatedAt(
                    existing,
                    remote.updatedAt ?? refresh.serverUpdatedAt
                );
                markSyncedContent(existing, diagramToServerContent(diagram));
                return { localId: existing, created: false, refreshed: true };
            }
        }
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
    if (remote.updatedAt) setBaseUpdatedAt(localId, remote.updatedAt);
    markSyncedContent(localId, diagramToServerContent(diagram));
    // a "Get latest" just before this keeps the diagram's database source
    adoptHandedOffSyncState(args.remoteId, localId);
    return { localId, created: true };
}
