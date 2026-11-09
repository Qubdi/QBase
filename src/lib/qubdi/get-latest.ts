import { projectDiagramPath } from './project-path';
import { clearRemoteId } from './remote-map';
import { clearSyncState, handOffSyncState } from './sync-state';

export interface GetLatestArgs {
    /** the diagram's copy in this browser */
    localId: string;
    remoteId: string;
    projectSlug: string;
    deleteLocal: (localId: string) => Promise<void>;
    /**
     * runs first, before the local copy is touched: the caller stops pending
     * saves here, so none can send what the copy held; the rest waits for it
     */
    beforeDelete?: () => Promise<void> | void;
}

/**
 * Drops this browser's copy of a server diagram and opens its URL again, which
 * downloads the server version. The editor caches the open diagram, so the
 * page itself is reloaded.
 */
export async function getLatestFromServer(args: GetLatestArgs): Promise<void> {
    await args.beforeDelete?.();
    await args.deleteLocal(args.localId);
    // the new copy gets a new local id: what it remembers about its database moves along
    handOffSyncState(args.localId, args.remoteId);
    clearSyncState(args.localId);
    clearRemoteId(args.localId);
    window.location.assign(projectDiagramPath(args.projectSlug, args.remoteId));
}
