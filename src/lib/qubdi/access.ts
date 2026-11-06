import { i18n } from '@/i18n/i18n';
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
                ? i18n.t('qubdi.workspace.lockedReason.takenSelf')
                : i18n.t('qubdi.workspace.lockedReason.takenOther', {
                      holder:
                          a.holder ??
                          i18n.t('qubdi.workspace.lockedReason.someoneElse'),
                  });
        case 'unbound':
            return i18n.t('qubdi.workspace.lockedReason.unbound');
        case 'lost':
            return i18n.t('qubdi.workspace.lockedReason.lost');
        case 'viewer':
            return projectName
                ? i18n.t('qubdi.workspace.lockedReason.viewerProject', {
                      project: projectName,
                  })
                : i18n.t('qubdi.workspace.lockedReason.viewerThis');
        case 'error':
            return i18n.t('qubdi.workspace.lockedReason.error');
        default:
            return null;
    }
}
