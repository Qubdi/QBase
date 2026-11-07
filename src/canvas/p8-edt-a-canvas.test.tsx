import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { shop } from './test/fixtures';
import { renderCanvas } from './test/render';
import { FIT_MS } from './use-viewport';

const camera = vi.hoisted(() => ({
    fit: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetZoom: vi.fn(),
    focusOn: vi.fn(),
}));
vi.mock('./use-viewport', async (original) => ({
    ...(await original<Record<string, unknown>>()),
    useViewportControls: () => camera,
}));

describe('p8 EDT-022, EDT-025', () => {
    it('EDT-022: Show all animates for half a second and Mod+0 fits the view', () => {
        expect(FIT_MS).toBe(500);
        camera.fit.mockClear();
        renderCanvas(shop().design);
        fireEvent.keyDown(document.body, { key: '0', ctrlKey: true });
        expect(camera.fit).toHaveBeenCalled();
    });

    it('EDT-025: clicking a table selects it and clicking the background clears the selection', () => {
        const s = shop();
        const { container, store } = renderCanvas(s.design);
        fireEvent.click(
            screen
                .getByTestId(`entity-${s.users}`)
                .closest('.react-flow__node')!
        );
        expect(store.getState().ui.selection).toContain(s.users);
        act(() => undefined);
        fireEvent.click(container.querySelector('.react-flow__pane')!);
        expect(store.getState().ui.selection).toEqual([]);
    });
});
