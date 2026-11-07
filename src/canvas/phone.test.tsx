import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { CHROME_CSS } from './chrome-style';
import { buildNodes, NO_LIVE } from './flow-model';
import { resizedEnough } from './geometry';
import {
    miniFill,
    miniStroke,
    MINIMAP_BACKGROUND,
    MINIMAP_MASK,
} from './minimap-colors';
import { shop, withMemo, withRegion } from './test/fixtures';
import { renderCanvas } from './test/render';

const camera = vi.hoisted(() => ({
    fit: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetZoom: vi.fn(),
    focusOn: vi.fn(),
    zoomToIds: vi.fn(),
    viewportOrigin: vi.fn(),
}));
vi.mock('./use-viewport', () => ({ useViewportControls: () => camera }));

describe('minimap', () => {
    it('EDT-044: tables, areas and notes are drawn in their own colour; the map and its mask contrast', () => {
        const s = shop();
        const placed = withRegion(s.design, {
            x: 0,
            y: 0,
            width: 300,
            height: 200,
        });
        const noted = withMemo(placed.design);
        const d = noted.design;
        expect(miniFill(d, s.users, 'entity')).toContain(
            d.entities.byId[s.users].color
        );
        expect(miniStroke(d, s.users, 'entity')).toBe(
            d.entities.byId[s.users].color
        );
        expect(miniFill(d, placed.regionId, 'region')).toContain(
            d.regions.byId[placed.regionId].tint
        );
        expect(miniFill(d, noted.memoId, 'memo')).toContain(
            d.memos.byId[noted.memoId].tint
        );
        expect(miniFill(d, 'gone', 'entity')).toContain('--muted-foreground');
        // theme variables, so both themes get a contrasting map and outside
        expect(MINIMAP_BACKGROUND).toContain('--card');
        expect(MINIMAP_MASK).toContain('--muted-foreground');
    });

    it('EDT-044: a measured table keeps its size in the node, so the map and the lines survive rebuilds', () => {
        const s = shop();
        const input = {
            design: s.design,
            selection: new Set<string>(),
            visible: new Set([s.users, s.orders]),
            live: NO_LIVE,
            flashing: new Set<string>(),
            overlapping: new Set<string>(),
            sizes: { [s.users]: { width: 224, height: 112 } },
            outlineOverlaps: false,
            editable: true,
        };
        const nodes = buildNodes(input);
        const users = nodes.find((n) => n.id === s.users)!;
        const orders = nodes.find((n) => n.id === s.orders)!;
        expect(users.measured).toEqual({ width: 224, height: 112 });
        expect(users.initialHeight).toBeUndefined();
        expect(orders.measured).toBeUndefined();
    });

    it('EDT-044: the map is drawn with the canvas classes', () => {
        const { container } = renderCanvas(shop().design);
        expect(
            container.querySelector('.react-flow__minimap.qb-minimap')
        ).not.toBeNull();
    });
});

describe('first view and size changes', () => {
    it('EDT-012: the view fits once every table has a size', async () => {
        camera.fit.mockClear();
        renderCanvas(shop().design);
        await waitFor(() =>
            expect(camera.fit).toHaveBeenCalledWith({ instant: true })
        );
        const calls = camera.fit.mock.calls.filter(([o]) => o?.instant).length;
        expect(calls).toBe(1);
    });

    it('EDT-012: a container that changes a lot counts as resized; small changes do not', () => {
        expect(resizedEnough({ w: 1000, h: 800 }, { w: 390, h: 800 })).toBe(
            true
        );
        expect(resizedEnough({ w: 1000, h: 800 }, { w: 1000, h: 500 })).toBe(
            true
        );
        expect(resizedEnough({ w: 1000, h: 800 }, { w: 1040, h: 820 })).toBe(
            false
        );
        expect(resizedEnough({ w: 0, h: 0 }, { w: 0, h: 0 })).toBe(false);
    });
});

describe('phone layout', () => {
    it('EDT-008: on a narrow window the toolbar sits in a row below the corner tools, so nothing overlaps', () => {
        renderCanvas(shop().design);
        expect(screen.getByTestId('canvas-chrome-style').textContent).toBe(
            CHROME_CSS
        );
        const phone = CHROME_CSS.slice(CHROME_CSS.indexOf('@media'));
        expect(phone).toContain('.qb-toolbar');
        expect(phone).toContain('top:calc(var(--canvas-inset-top,0px) + 56px)');
        // corner tools start at 12px and are 32px tall; the toolbar starts at 56px
        expect(CHROME_CSS).toContain(
            'top:calc(var(--canvas-inset-top,0px) + 12px)'
        );
        // the pill is below the toolbar
        expect(phone).toContain('+ 104px');
    });

    it('EDT-008: the workspace can leave room with inset variables', () => {
        for (const name of ['top', 'bottom', 'left', 'right'])
            expect(CHROME_CSS).toContain(`--canvas-inset-${name}`);
        const { container } = renderCanvas(shop().design);
        expect(container.querySelector('.qb-toolbar')).not.toBeNull();
        expect(container.querySelector('.qb-corner')).not.toBeNull();
    });
});
