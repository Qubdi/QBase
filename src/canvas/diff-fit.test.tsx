import { describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { apply } from '@/core/commands/apply';
import { createEntityParts } from '@/core/model/defaults';
import { NOW, rng } from '@/core/testing/helpers';
import type { DiffMarks } from './diff-marks';
import { shop } from './test/fixtures';
import { renderCanvas } from './test/render';

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

describe('browser finding 3: a preview-only table comes into view', () => {
    it('draws a far table of the preview and fits the view to include it', async () => {
        const s = shop();
        const parts = createEntityParts(s.design, {
            name: 'warehouses',
            x: 90000,
            y: 0,
            now: NOW,
            random: rng(41),
        });
        const result = apply(s.design, { type: 'entity.insert', parts });
        if (!result.ok) throw new Error(result.message);
        const diff: DiffMarks = {
            design: result.design,
            tables: { [parts.entity.id]: 'added' },
            links: {},
        };
        camera.fit.mockClear();
        const { container } = renderCanvas(s.design, {
            canvas: { hooks: { diff } },
        });
        // far outside the window, yet drawn (so it is measured and in the minimap)
        await waitFor(() =>
            expect(
                container.querySelector(`[data-id="${parts.entity.id}"]`)
            ).toBeTruthy()
        );
        await waitFor(() => expect(camera.fit).toHaveBeenCalled());
        // measured, so the minimap can draw it
        await waitFor(() =>
            expect(
                container.querySelector('.react-flow__minimap-node')
            ).toBeTruthy()
        );
        await waitFor(() =>
            expect(
                container.querySelectorAll('.react-flow__minimap-node').length
            ).toBe(Object.keys(result.design.entities.byId).length)
        );
    });
});
