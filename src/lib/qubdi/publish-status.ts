import { i18n } from '@/i18n/i18n';

export interface PublishStatus {
    synced: boolean;
    publishedVersion: number | null;
    unpublishedChanges: boolean;
}

/** The full sentence: the Publish button's tooltip and the dialog text. */
export const publishStatusText = (s: PublishStatus): string => {
    if (!s.synced) return i18n.t('qubdi.workspace.publishStatus.notSynced');
    if (s.publishedVersion === null) {
        return i18n.t('qubdi.workspace.publishStatus.notPublished');
    }
    return i18n.t(
        s.unpublishedChanges
            ? 'qubdi.workspace.publishStatus.publishedChanges'
            : 'qubdi.workspace.publishStatus.published',
        { version: s.publishedVersion }
    );
};

export type PublishTone = 'neutral' | 'warning' | 'success';

/**
 * The small badge inside the Publish button. An empty label is a bare dot (no
 * version to show yet); the words live in publishStatusText.
 */
export const publishStatusBadge = (
    s: PublishStatus
): { label: string; tone: PublishTone } => {
    if (!s.synced) return { label: '', tone: 'neutral' };
    if (s.publishedVersion === null) return { label: '', tone: 'warning' };
    // the dot marks changes that are saved but not published yet
    return s.unpublishedChanges
        ? { label: `v${s.publishedVersion} •`, tone: 'warning' }
        : { label: `v${s.publishedVersion}`, tone: 'success' };
};
