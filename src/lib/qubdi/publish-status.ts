export interface PublishStatus {
    synced: boolean;
    publishedVersion: number | null;
    unpublishedChanges: boolean;
}

/** One-line status shown next to the Publish button. */
export const publishStatusText = (s: PublishStatus): string => {
    if (!s.synced) return 'Not synced to server';
    if (s.publishedVersion === null) return 'Not published';
    return s.unpublishedChanges
        ? `Published v${s.publishedVersion}, unpublished changes`
        : `Published v${s.publishedVersion}`;
};
