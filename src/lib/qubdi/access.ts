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
    /** inside a project workspace, before any diagram is chosen */
    | { status: 'no_diagram'; projectId: string }
    /** a local diagram that is not in any project */
    | { status: 'unbound' }
    /** bound to the server, but the server no longer lets this user see it */
    | { status: 'lost' }
    /** the server could not be reached */
    | { status: 'error' }
    | { status: 'viewer'; projectId: string; remoteId: string }
    | { status: 'editor'; projectId: string; remoteId: string }
    /** may edit, but someone else (or another tab) is editing it right now */
    | {
          status: 'taken';
          projectId: string;
          remoteId: string;
          /** who is editing, when the server said */
          holder: string | null;
      };

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

/**
 * What the server's edit lock says about this editor: only one editor at a
 * time may change a diagram.
 */
export type LockState =
    | { status: 'checking' }
    | { status: 'held' }
    | { status: 'taken'; holder: string | null }
    /** the server could not be asked */
    | { status: 'unreachable' };

/**
 * An editor's access once the edit lock is known; null while it is still being
 * asked for. Only an editor is affected: everyone else already cannot edit.
 */
export function applyLock(
    access: AccessState,
    lock: LockState
): AccessState | null {
    if (access.status !== 'editor') return access;
    switch (lock.status) {
        case 'checking':
            return null;
        case 'held':
            return access;
        case 'taken':
            return {
                status: 'taken',
                projectId: access.projectId,
                remoteId: access.remoteId,
                holder: lock.holder,
            };
        case 'unreachable':
            return { status: 'error' };
    }
}

/** The editor must not change or store anything in these states. */
export const isLocked = (a: AccessState): boolean =>
    a.status === 'no_diagram' ||
    a.status === 'unbound' ||
    a.status === 'lost' ||
    a.status === 'viewer' ||
    a.status === 'taken' ||
    a.status === 'error';

/** One line for the banner that explains why editing is off. */
export function lockedReason(
    a: AccessState,
    projectName?: string,
    /** the signed-in user, to tell their own other tab from someone else */
    selfEmail?: string
): string | null {
    switch (a.status) {
        case 'taken':
            return a.holder && a.holder === selfEmail
                ? 'This diagram is open for editing in another tab or window, so it is read-only here.'
                : `${a.holder ?? 'Someone else'} is editing this diagram, so it is read-only for you for now.`;
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
