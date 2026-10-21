import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    claimLocalData,
    clearLocalUserData,
    LOCAL_DB_NAME,
    LOCAL_OWNER_KEY,
} from '../local-data';

describe('clearLocalUserData', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('removes the qubdidb.* keys from both storages and keeps the rest', async () => {
        localStorage.setItem('qubdidb.remote-map', '{}');
        localStorage.setItem('qubdidb.sent-content', '{}');
        localStorage.setItem('theme', 'dark');
        sessionStorage.setItem('qubdidb.editor-id', 'tab');
        sessionStorage.setItem('other', '1');
        await clearLocalUserData(async () => undefined);
        expect(localStorage.getItem('qubdidb.remote-map')).toBeNull();
        expect(localStorage.getItem('qubdidb.sent-content')).toBeNull();
        expect(sessionStorage.getItem('qubdidb.editor-id')).toBeNull();
        expect(localStorage.getItem('theme')).toBe('dark');
        expect(sessionStorage.getItem('other')).toBe('1');
    });

    it('deletes the local diagrams database', async () => {
        const deleteDatabase = vi.fn(async () => undefined);
        await clearLocalUserData(deleteDatabase);
        expect(deleteDatabase).toHaveBeenCalledExactlyOnceWith(LOCAL_DB_NAME);
    });

    it('still clears the keys when the database cannot be deleted', async () => {
        localStorage.setItem('qubdidb.remote-map', '{}');
        await expect(
            clearLocalUserData(async () => {
                throw new Error('blocked');
            })
        ).resolves.toBeUndefined();
        expect(localStorage.getItem('qubdidb.remote-map')).toBeNull();
    });
});

describe('claimLocalData', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('records the owner on a browser with no earlier owner, without clearing anything', async () => {
        localStorage.setItem('qubdidb.remote-map', '{"a":"b"}');
        const deleteDatabase = vi.fn(async () => undefined);
        expect(await claimLocalData('user-1', deleteDatabase)).toBe(false);
        expect(localStorage.getItem(LOCAL_OWNER_KEY)).toBe('user-1');
        expect(localStorage.getItem('qubdidb.remote-map')).toBe('{"a":"b"}');
        expect(deleteDatabase).not.toHaveBeenCalled();
    });

    it('leaves the copies alone for the same person coming back', async () => {
        await claimLocalData('user-1', async () => undefined);
        localStorage.setItem('qubdidb.remote-map', '{"a":"b"}');
        const deleteDatabase = vi.fn(async () => undefined);
        expect(await claimLocalData('user-1', deleteDatabase)).toBe(false);
        expect(localStorage.getItem('qubdidb.remote-map')).toBe('{"a":"b"}');
        expect(deleteDatabase).not.toHaveBeenCalled();
    });

    it("clears another person's copies, then records the new owner", async () => {
        await claimLocalData('user-1', async () => undefined);
        localStorage.setItem('qubdidb.remote-map', '{"a":"b"}');
        sessionStorage.setItem('qubdidb.editor-id', 'tab');
        localStorage.setItem('theme', 'dark');
        const deleteDatabase = vi.fn(async () => undefined);
        expect(await claimLocalData('user-2', deleteDatabase)).toBe(true);
        expect(deleteDatabase).toHaveBeenCalledExactlyOnceWith(LOCAL_DB_NAME);
        expect(localStorage.getItem('qubdidb.remote-map')).toBeNull();
        expect(sessionStorage.getItem('qubdidb.editor-id')).toBeNull();
        expect(localStorage.getItem(LOCAL_OWNER_KEY)).toBe('user-2');
        expect(localStorage.getItem('theme')).toBe('dark');
        // and the next claim by the new owner is quiet
        expect(await claimLocalData('user-2', deleteDatabase)).toBe(false);
    });
});
