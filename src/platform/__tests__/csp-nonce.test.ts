import { afterEach, describe, expect, it, vi } from 'vitest';

const withMeta = (content: string | null) => {
    document.head
        .querySelectorAll('meta[name="csp-nonce"]')
        .forEach((m) => m.remove());
    if (content === null) return;
    const meta = document.createElement('meta');
    meta.name = 'csp-nonce';
    meta.content = content;
    document.head.appendChild(meta);
};

// the nonce is read once per page load, so each test starts from a fresh module
const load = async () => {
    vi.resetModules();
    return import('../csp-nonce');
};

afterEach(() => {
    withMeta(null);
    Reflect.deleteProperty(window, '__webpack_nonce__');
});

describe('cspNonce', () => {
    it('reads the nonce the server wrote into the page', async () => {
        withMeta('abc123==');
        const { cspNonce } = await load();
        expect(cspNonce()).toBe('abc123==');
    });

    it('has none when the page was not served with one', async () => {
        withMeta(null);
        expect((await load()).cspNonce()).toBeUndefined();
        // the placeholder of the dev server and of a build served as a plain file
        withMeta('__CSP_NONCE__');
        expect((await load()).cspNonce()).toBeUndefined();
        withMeta('');
        expect((await load()).cspNonce()).toBeUndefined();
    });
});

describe('provideNonceToLibraries', () => {
    it('hands the nonce to libraries that add a <style> themselves', async () => {
        withMeta('n0nce');
        (await load()).provideNonceToLibraries();
        expect(Reflect.get(window, '__webpack_nonce__')).toBe('n0nce');
    });

    it('sets nothing when there is no nonce', async () => {
        withMeta(null);
        (await load()).provideNonceToLibraries();
        expect(Reflect.has(window, '__webpack_nonce__')).toBe(false);
    });
});
