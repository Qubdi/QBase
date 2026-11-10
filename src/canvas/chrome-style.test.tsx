import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
    document.head
        .querySelectorAll('meta[name="csp-nonce"]')
        .forEach((m) => m.remove());
    vi.resetModules();
});

describe('the canvas <style> elements', () => {
    it('carry the nonce of the page, so the policy lets them in', async () => {
        const meta = document.createElement('meta');
        meta.name = 'csp-nonce';
        meta.content = 'page-nonce';
        document.head.appendChild(meta);
        vi.resetModules();
        const { ChromeStyle, DropTargetStyle } = await import('./chrome-style');
        const view = render(
            <>
                <ChromeStyle />
                <DropTargetStyle />
            </>
        );
        for (const id of ['canvas-chrome-style', 'canvas-drop-style']) {
            const style = view.getByTestId(id);
            // the browser hides the nonce attribute from script once it is applied
            expect(
                style.getAttribute('nonce') ?? (style as HTMLStyleElement).nonce
            ).toBe('page-nonce');
        }
    });

    it('carry none when the page has none', async () => {
        vi.resetModules();
        const { ChromeStyle } = await import('./chrome-style');
        const view = render(<ChromeStyle />);
        expect(
            view.getByTestId('canvas-chrome-style').getAttribute('nonce')
        ).toBeNull();
    });
});
