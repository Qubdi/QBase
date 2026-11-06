import { afterEach, describe, expect, it } from 'vitest';
import {
    flushPendingSave,
    hasUnsavedChanges,
    registerFlushNow,
    resetSaveStatus,
    setSaveStatus,
} from '../save-status-store';

describe('hasUnsavedChanges', () => {
    afterEach(() => resetSaveStatus());

    it('is false when nothing is waiting, sending or refused', () => {
        expect(hasUnsavedChanges()).toBe(false);
        setSaveStatus('saved');
        expect(hasUnsavedChanges()).toBe(false);
    });

    it('is true while an edit is waiting, on its way, or was refused', () => {
        for (const status of ['pending', 'saving', 'error'] as const) {
            setSaveStatus(status);
            expect(hasUnsavedChanges(), status).toBe(true);
        }
    });

    it('is false again once the saver is reset', () => {
        setSaveStatus('pending');
        resetSaveStatus();
        expect(hasUnsavedChanges()).toBe(false);
    });
});

describe('flushPendingSave', () => {
    afterEach(() => registerFlushNow(null));

    it('resolves at once when no autosaver is running', async () => {
        await expect(flushPendingSave()).resolves.toBeUndefined();
    });

    it('waits for the autosaver to finish sending', async () => {
        const order: string[] = [];
        registerFlushNow(async () => {
            await new Promise((r) => setTimeout(r, 5));
            order.push('sent');
        });
        await flushPendingSave();
        order.push('after');
        expect(order).toEqual(['sent', 'after']);
    });

    it("never rejects: a failed save is the autosaver's to report", async () => {
        registerFlushNow(() => Promise.reject(new Error('offline')));
        await expect(flushPendingSave()).resolves.toBeUndefined();
    });
});
