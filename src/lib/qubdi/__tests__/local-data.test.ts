import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    claimLocalData,
    clearLocalUserData,
    LEGACY_LOCAL_DB_NAME,
    LOCAL_DB_NAME,
    LOCAL_OWNER_KEY,
} from '../local-data';

const expectBothDeleted = (deleteDatabase: ReturnType<typeof vi.fn>) => {
    expect(deleteDatabase).toHaveBeenCalledTimes(2);
    expect(deleteDatabase).toHaveBeenCalledWith(LOCAL_DB_NAME);
    expect(deleteDatabase).toHaveBeenCalledWith(LEGACY_LOCAL_DB_NAME);
};

describe('clearLocalUserData', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('removes the qbase.* keys from both storages and keeps the rest', async () => {
        localStorage.setItem('qbase.remote-map', '{}');
        localStorage.setItem('qbase.sent-content', '{}');
        localStorage.setItem('theme', 'dark');
        sessionStorage.setItem('qbase.editor-id', 'tab');
        sessionStorage.setItem('other', '1');
        await clearLocalUserData(async () => undefined);
        expect(localStorage.getItem('qbase.remote-map')).toBeNull();
        expect(localStorage.getItem('qbase.sent-content')).toBeNull();
        expect(sessionStorage.getItem('qbase.editor-id')).toBeNull();
        expect(localStorage.getItem('theme')).toBe('dark');
        expect(sessionStorage.getItem('other')).toBe('1');
    });

    it('deletes the local diagrams database, under the new and the old name', async () => {
        const deleteDatabase = vi.fn(async () => undefined);
        await clearLocalUserData(deleteDatabase);
        expectBothDeleted(deleteDatabase);
    });

    it('still clears the keys when the database cannot be deleted', async () => {
        localStorage.setItem('qbase.remote-map', '{}');
        await expect(
            clearLocalUserData(async () => {
                throw new Error('blocked');
            })
        ).resolves.toBeUndefined();
        expect(localStorage.getItem('qbase.remote-map')).toBeNull();
    });

    it('still deletes the database when reading the storages throws', async () => {
        const blocked = () => {
            throw new DOMException('blocked', 'SecurityError');
        };
        vi.spyOn(window, 'localStorage', 'get').mockImplementation(blocked);
        vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(blocked);
        const deleteDatabase = vi.fn(async () => undefined);
        try {
            await expect(
                clearLocalUserData(deleteDatabase)
            ).resolves.toBeUndefined();
        } finally {
            vi.restoreAllMocks();
        }
        expectBothDeleted(deleteDatabase);
    });
});

describe('claimLocalData', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('records the owner on a browser with no earlier owner, without clearing anything', async () => {
        localStorage.setItem('qbase.remote-map', '{"a":"b"}');
        const deleteDatabase = vi.fn(async () => undefined);
        expect(await claimLocalData('user-1', deleteDatabase)).toBe(false);
        expect(localStorage.getItem(LOCAL_OWNER_KEY)).toBe('user-1');
        expect(localStorage.getItem('qbase.remote-map')).toBe('{"a":"b"}');
        expect(deleteDatabase).not.toHaveBeenCalled();
    });

    it('leaves the copies alone for the same person coming back', async () => {
        await claimLocalData('user-1', async () => undefined);
        localStorage.setItem('qbase.remote-map', '{"a":"b"}');
        const deleteDatabase = vi.fn(async () => undefined);
        expect(await claimLocalData('user-1', deleteDatabase)).toBe(false);
        expect(localStorage.getItem('qbase.remote-map')).toBe('{"a":"b"}');
        expect(deleteDatabase).not.toHaveBeenCalled();
    });

    it("clears another person's copies, then records the new owner", async () => {
        await claimLocalData('user-1', async () => undefined);
        localStorage.setItem('qbase.remote-map', '{"a":"b"}');
        sessionStorage.setItem('qbase.editor-id', 'tab');
        localStorage.setItem('theme', 'dark');
        const deleteDatabase = vi.fn(async () => undefined);
        expect(await claimLocalData('user-2', deleteDatabase)).toBe(true);
        expectBothDeleted(deleteDatabase);
        expect(localStorage.getItem('qbase.remote-map')).toBeNull();
        expect(sessionStorage.getItem('qbase.editor-id')).toBeNull();
        expect(localStorage.getItem(LOCAL_OWNER_KEY)).toBe('user-2');
        expect(localStorage.getItem('theme')).toBe('dark');
        // and the next claim by the new owner is quiet
        expect(await claimLocalData('user-2', deleteDatabase)).toBe(false);
    });
});
