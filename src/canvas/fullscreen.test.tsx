import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { CHROME_CSS } from './chrome-style';
import { shop } from './test/fixtures';
import { renderCanvas } from './test/render';

vi.mock('./use-viewport', () => ({
    useViewportControls: () => ({
        fit: vi.fn(),
        zoomIn: vi.fn(),
        zoomOut: vi.fn(),
        resetZoom: vi.fn(),
        focusOn: vi.fn(),
        zoomToIds: vi.fn(),
        viewportOrigin: vi.fn(),
    }),
}));

function offer(enabled: boolean) {
    const request = vi.fn(() => Promise.resolve());
    const exit = vi.fn(() => Promise.resolve());
    let element: Element | null = null;
    Object.defineProperty(document, 'fullscreenEnabled', {
        configurable: true,
        value: enabled,
    });
    Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        get: () => element,
    });
    document.documentElement.requestFullscreen = request;
    document.exitFullscreen = exit;
    return {
        request,
        exit,
        set(next: Element | null) {
            element = next;
            document.dispatchEvent(new Event('fullscreenchange'));
        },
    };
}

afterEach(() => {
    Object.defineProperty(document, 'fullscreenEnabled', {
        configurable: true,
        value: false,
    });
    Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        get: () => null,
    });
});

describe('full screen', () => {
    it('EDT-048: the toolbar button enters and leaves full screen and follows the browser', () => {
        const api = offer(true);
        renderCanvas(shop().design);
        fireEvent.click(screen.getByLabelText('Full screen'));
        expect(api.request).toHaveBeenCalledTimes(1);
        act(() => api.set(document.documentElement));
        const leave = screen.getByLabelText('Exit full screen');
        expect(leave).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(leave);
        expect(api.exit).toHaveBeenCalledTimes(1);
        // the person pressed Escape: the button follows
        act(() => api.set(null));
        expect(screen.getByLabelText('Full screen')).toBeInTheDocument();
    });

    it('EDT-048: the button is not offered where the browser has no full screen', () => {
        offer(false);
        renderCanvas(shop().design);
        expect(screen.queryByLabelText('Full screen')).toBeNull();
    });

    it('EDT-008: on a phone the minimap is 60 px high', () => {
        const phone = CHROME_CSS.slice(CHROME_CSS.indexOf('@media'));
        expect(phone).toMatch(/\.qb-minimap[^}]*height:60px/);
    });
});
