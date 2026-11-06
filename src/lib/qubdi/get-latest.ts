import { projectDiagramPath } from './project-path';
import { clearRemoteId } from './remote-map';
import { clearSyncState, handOffSyncState } from './sync-state';

export interface GetLatestArgs {
    /** the diagram's copy in this browser */
    localId: string;
    remoteId: string;
    projectSlug: string;
    deleteLocal: (localId: string) => Promise<void>;
    /** runs once the local copy is gone, right before the page reloads; the reload waits for it */
    beforeReload?: () => Promise<void> | void;
}

/**
 * Drops this browser's copy of a server diagram and opens its URL again, which
 * downloads the server version. The editor caches the open diagram, so the
 * page itself is reloaded.
 */
export async function getLatestFromServer(args: GetLatestArgs): Promise<void> {
    await args.deleteLocal(args.localId);
    // the new copy gets a new local id: what it remembers about its database moves along
    handOffSyncState(args.localId, args.remoteId);
    clearSyncState(args.localId);
    clearRemoteId(args.localId);
    await args.beforeReload?.();
    window.location.assign(projectDiagramPath(args.projectSlug, args.remoteId));
}
