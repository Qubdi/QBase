import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('getEditorId', () => {
    beforeEach(() => {
        sessionStorage.clear();
        vi.resetModules();
    });

    const load = async () => (await import('../editor-id')).getEditorId;

    it('names the page with one id for as long as it lives', async () => {
        const getEditorId = await load();
        expect(getEditorId()).toBeTruthy();
        expect(getEditorId()).toBe(getEditorId());
    });

    it('gives a reloaded page a new id: its old lock is released as it leaves', async () => {
        const first = (await load())();
        vi.resetModules(); // a reload: a fresh page
        const second = (await load())();
        expect(second).not.toBe(first);
    });

    it('is not copied into a duplicated tab, which copies session storage', async () => {
        const first = (await load())();
        const copy = new Map<string, string>();
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i)!;
            copy.set(key, sessionStorage.getItem(key)!);
        }
        // nothing in the copy can carry the id into the other tab
        expect([...copy.values()]).not.toContain(first);
        vi.resetModules();
        for (const [k, v] of copy) sessionStorage.setItem(k, v);
        expect((await load())()).not.toBe(first);
    });

    it('never touches storage, so a browser that blocks it changes nothing', async () => {
        const get = vi.spyOn(Storage.prototype, 'getItem');
        const set = vi.spyOn(Storage.prototype, 'setItem');
        const getEditorId = await load();
        getEditorId();
        expect(get).not.toHaveBeenCalled();
        expect(set).not.toHaveBeenCalled();
        get.mockRestore();
        set.mockRestore();
    });
});
