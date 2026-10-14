import type { RemoteDiagramSummary } from './api';

/**
 * What the signed-in user may do with the diagram open in the editor.
 * Nothing exists outside a project, so a diagram that is not bound to one on
 * the server is read-only.
 */
export type AccessState =
    /** no backend configured: the editor behaves as a local app */
    | { status: 'off' }
    | { status: 'loading' }
    | { status: 'signed_out' }
    /** a local diagram that is not in any project */
    | { status: 'unbound' }
    /** bound to the server, but the server no longer lets this user see it */
    | { status: 'lost' }
    /** the server could not be reached */
    | { status: 'error' }
    | { status: 'viewer'; projectId: string; remoteId: string }
    | { status: 'editor'; projectId: string; remoteId: string };

/** Decides access for a bound diagram from the list the server returned. */
export function resolveAccess(
    remoteId: string | undefined,
    list: RemoteDiagramSummary[]
): AccessState {
    if (!remoteId) return { status: 'unbound' };
    const found = list.find((d) => d.id === remoteId);
    if (!found || !found.projectId) return { status: 'lost' };
    return {
        status: found.role === 'viewer' ? 'viewer' : 'editor',
        projectId: found.projectId,
        remoteId,
    };
}

/** The editor must not change or store anything in these states. */
export const isLocked = (a: AccessState): boolean =>
    a.status === 'unbound' ||
    a.status === 'lost' ||
    a.status === 'viewer' ||
    a.status === 'error';

/** One line for the banner that explains why editing is off. */
export function lockedReason(
    a: AccessState,
    projectName?: string
): string | null {
    switch (a.status) {
        case 'unbound':
            return 'This diagram is not in a project, so it is read-only. Move it into a project to edit it.';
        case 'lost':
            return 'You no longer have access to this diagram on the server, so it is read-only.';
        case 'viewer':
            return `You have view-only access${projectName ? ` to ${projectName}` : ' to this project'}. Ask an admin for the Editor role to make changes.`;
        case 'error':
            return 'Could not reach the server, so this diagram is read-only for now.';
        default:
            return null;
    }
}
