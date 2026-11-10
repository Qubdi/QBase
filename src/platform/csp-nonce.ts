/** What the server writes into index.html in place of its placeholder. */
const PLACEHOLDER = '__CSP_NONCE__';

let cached: string | undefined | null = null;

/**
 * The nonce the server put in this page's Content-Security-Policy, for the
 * <style> elements the app creates itself. Undefined when there is none: the
 * dev server, or a page served without the nonce.
 */
export function cspNonce(): string | undefined {
    if (cached !== null) return cached;
    const content = document
        .querySelector('meta[name="csp-nonce"]')
        ?.getAttribute('content');
    cached = content && content !== PLACEHOLDER ? content : undefined;
    return cached;
}

/**
 * Libraries that add a <style> element themselves (the scroll lock of the
 * dialogs and menus) take its nonce from `__webpack_nonce__`, the name
 * bundlers made common. Call this before the first screen is drawn.
 */
export function provideNonceToLibraries(): void {
    const nonce = cspNonce();
    if (nonce) Reflect.set(window, '__webpack_nonce__', nonce);
}
