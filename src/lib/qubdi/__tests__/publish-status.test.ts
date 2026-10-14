import { describe, expect, it } from 'vitest';
import { publishStatusText } from '../publish-status';

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
