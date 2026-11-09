import { i18n } from '@/i18n/i18n';
import { ApiError, errorMessage } from './api';
import { UnpublishedDiagramError } from './open-remote';

/** What opening a server diagram ends in when it fails. */
export type OpenFailure =
    { kind: 'diagram_missing' } | { kind: 'failed'; message: string };

/**
 * The server answers a viewer of a diagram with nothing published `404
 * not_published` (it sends nothing of the working copy): that is "not
 * published yet", not "missing". Any other 404 is a diagram that is gone or
 * not the user's.
 */
export function openFailureOf(e: unknown): OpenFailure {
    const unpublished = (): OpenFailure => ({
        kind: 'failed',
        message: i18n.t('qubdi.workspace.diagramAccess.unpublished'),
    });
    if (e instanceof ApiError && e.status === 404) {
        return e.code === 'not_published'
            ? unpublished()
            : { kind: 'diagram_missing' };
    }
    return e instanceof UnpublishedDiagramError
        ? unpublished()
        : { kind: 'failed', message: errorMessage(e) };
}
