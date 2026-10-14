import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commentsStore, type EditorComment } from '../comments-store';
import { targetKey } from '../comments-model';

const make = (over: Partial<EditorComment>): EditorComment => ({
    id: 'c',
    targetType: 'table',
    targetId: 't1',
    body: 'b',
    resolved: false,
    snapshotVersion: 1,
    orphaned: false,
    authorEmail: 'a@b.co',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
});

describe('commentsStore', () => {
    beforeEach(() => commentsStore.reset());

    it('summarizes comments by target and ignores orphaned ones for markers', () => {
        commentsStore.setComments([
            make({ id: '1' }),
            make({ id: '2', resolved: true }),
            make({ id: '3', targetId: 't2', orphaned: true }),
        ]);
        const { summary, comments } = commentsStore.getState();
        expect(comments).toHaveLength(3);
        expect(summary.get(targetKey('table', 't1'))).toEqual({
            open: 1,
            total: 2,
        });
        expect(summary.has(targetKey('table', 't2'))).toBe(false);
    });

    it('notifies subscribers and stops after unsubscribe', () => {
        const fn = vi.fn();
        const off = commentsStore.subscribe(fn);
        commentsStore.toggleMarkers();
        expect(fn).toHaveBeenCalledTimes(1);
        off();
        commentsStore.toggleMarkers();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('toggles markers and keeps the previous state object untouched', () => {
        const before = commentsStore.getState();
        commentsStore.toggleMarkers();
        expect(before.showMarkers).toBe(true);
        expect(commentsStore.getState().showMarkers).toBe(false);
        expect(commentsStore.getState()).not.toBe(before);
    });

    it('opens the panel on a target and clears the focus on close', () => {
        commentsStore.openPanel({ type: 'field', id: 'f1' });
        expect(commentsStore.getState()).toMatchObject({
            panelOpen: true,
            focus: { type: 'field', id: 'f1' },
        });
        commentsStore.closePanel();
        expect(commentsStore.getState()).toMatchObject({
            panelOpen: false,
            focus: null,
        });
    });

    it('resets everything', () => {
        commentsStore.setComments([make({})]);
        commentsStore.toggleMarkers();
        commentsStore.reset();
        expect(commentsStore.getState().comments).toHaveLength(0);
        expect(commentsStore.getState().showMarkers).toBe(true);
    });
});
