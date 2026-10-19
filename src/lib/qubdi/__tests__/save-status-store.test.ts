import { afterEach, describe, expect, it } from 'vitest';
import {
    hasUnsavedChanges,
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
