import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('getEditorId', () => {
    beforeEach(() => {
        sessionStorage.clear();
        vi.resetModules();
    });

    const load = async () => (await import('../editor-id')).getEditorId;

    it('names the tab with one id for as long as the page lives', async () => {
        const getEditorId = await load();
        expect(getEditorId()).toBeTruthy();
        expect(getEditorId()).toBe(getEditorId());
    });

    it('keeps the id when the tab reloads, so it takes its own lock back', async () => {
        const first = (await load())();
        vi.resetModules(); // a reload: a fresh page, the same tab
        const second = (await load())();
        expect(second).toBe(first);
    });

    it('gives another tab its own id', async () => {
        const first = (await load())();
        sessionStorage.clear(); // a new tab starts with empty session storage
        vi.resetModules();
        const second = (await load())();
        expect(second).not.toBe(first);
    });

    it('still works when the browser will not store anything', async () => {
        const spy = vi
            .spyOn(Storage.prototype, 'getItem')
            .mockImplementation(() => {
                throw new Error('blocked');
            });
        const setSpy = vi
            .spyOn(Storage.prototype, 'setItem')
            .mockImplementation(() => {
                throw new Error('blocked');
            });
        const getEditorId = await load();
        expect(getEditorId()).toBe(getEditorId());
        spy.mockRestore();
        setSpy.mockRestore();
    });
});
