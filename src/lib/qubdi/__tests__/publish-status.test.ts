import { describe, expect, it } from 'vitest';
import { publishStatusBadge, publishStatusText } from '../publish-status';

describe('publishStatusText', () => {
    it('says when the diagram is not on the server', () => {
        expect(
            publishStatusText({
                synced: false,
                publishedVersion: null,
                unpublishedChanges: true,
            })
        ).toBe('Not synced to server');
    });

    it('says when nothing was published yet', () => {
        expect(
            publishStatusText({
                synced: true,
                publishedVersion: null,
                unpublishedChanges: true,
            })
        ).toBe('Not published');
    });

    it('shows the version, with or without pending changes', () => {
        expect(
            publishStatusText({
                synced: true,
                publishedVersion: 14,
                unpublishedChanges: false,
            })
        ).toBe('Published v14');
        expect(
            publishStatusText({
                synced: true,
                publishedVersion: 14,
                unpublishedChanges: true,
            })
        ).toBe('Published v14, unpublished changes');
    });
});

describe('publishStatusBadge', () => {
    it('is a grey dot while the diagram is not on the server', () => {
        expect(
            publishStatusBadge({
                synced: false,
                publishedVersion: null,
                unpublishedChanges: true,
            })
        ).toEqual({ label: '', tone: 'neutral' });
    });

    it('is an amber dot when nothing was published yet', () => {
        expect(
            publishStatusBadge({
                synced: true,
                publishedVersion: null,
                unpublishedChanges: true,
            })
        ).toEqual({ label: '', tone: 'warning' });
    });

    it('shows just the version when nothing is waiting to be published', () => {
        expect(
            publishStatusBadge({
                synced: true,
                publishedVersion: 14,
                unpublishedChanges: false,
            })
        ).toEqual({ label: 'v14', tone: 'success' });
    });

    it('warns when the saved copy is ahead of the published version', () => {
        expect(
            publishStatusBadge({
                synced: true,
                publishedVersion: 14,
                unpublishedChanges: true,
            })
        ).toEqual({ label: 'v14 •', tone: 'warning' });
    });
});
