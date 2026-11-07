import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { withTables } from '@/core/testing/helpers';
import { buildEdges, drawnEntityIds, NO_LIVE } from './flow-model';
import { FIT_MAX_ZOOM, FIT_PADDING } from './geometry';
import { interactionProps } from './interaction';
import { shop } from './test/fixtures';
import { renderCanvas } from './test/render';

const camera = vi.hoisted(() => ({
    fit: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetZoom: vi.fn(),
    focusOn: vi.fn(),
}));
vi.mock('./use-viewport', () => ({ useViewportControls: () => camera }));

describe('canvas shell', () => {
    it('EDT-011: a badge shows while the design is loading', () => {
        const view = renderCanvas(withTables(['a']), {
            canvas: { loading: true },
        });
        expect(screen.getByText('Loading diagram...')).toBeInTheDocument();
        view.unmount();
        renderCanvas(withTables(['a']));
        expect(screen.queryByText('Loading diagram...')).toBeNull();
    });

    it('EDT-012: the first view fits with 10% padding and at most 80% zoom', () => {
        const props = interactionProps(
            { zoomOnScroll: false },
            { editable: true, shiftHeld: false }
        );
        expect(props.fitView).toBe(true);
        expect(props.fitViewOptions).toEqual({ padding: 0.1, maxZoom: 0.8 });
        expect(FIT_PADDING).toBe(0.1);
        expect(FIT_MAX_ZOOM).toBe(0.8);
    });

    it('EDT-015, EDT-016: the background pans, and the wheel pans by default', () => {
        const props = interactionProps(
            { zoomOnScroll: false },
            { editable: true, shiftHeld: false }
        );
        expect(props.panOnDrag).toBe(true);
        expect(props.panOnScroll).toBe(true);
        expect(props.zoomOnScroll).toBe(false);
    });

    it('EDT-017: with Zoom on Scroll the wheel zooms instead of panning', () => {
        const props = interactionProps(
            { zoomOnScroll: true },
            { editable: true, shiftHeld: false }
        );
        expect(props.zoomOnScroll).toBe(true);
        expect(props.panOnScroll).toBe(false);
    });

    it('EDT-018: Ctrl or Cmd with the wheel and a pinch zoom whatever the setting', () => {
        for (const zoomOnScroll of [true, false]) {
            const props = interactionProps(
                { zoomOnScroll },
                { editable: true, shiftHeld: false }
            );
            expect(props.zoomActivationKeyCode).toEqual(['Control', 'Meta']);
            expect(props.zoomOnPinch).toBe(true);
        }
    });

    it('EDT-019: zoom stays between 10% and 500%', () => {
        const props = interactionProps(
            { zoomOnScroll: false },
            { editable: true, shiftHeld: false }
        );
        expect(props.minZoom).toBe(0.1);
        expect(props.maxZoom).toBe(5);
    });

    it('EDT-027, EDT-028: Shift, Ctrl or Cmd add to the selection; the rubber band takes only what it wholly encloses', () => {
        const props = interactionProps(
            { zoomOnScroll: false },
            { editable: true, shiftHeld: false }
        );
        expect(props.multiSelectionKeyCode).toEqual([
            'Shift',
            'Control',
            'Meta',
        ]);
        expect(props.selectionKeyCode).toBe('Shift');
        expect(props.selectionMode).toBe('full');
    });

    it('EDT-014: a read-only canvas cannot drag or connect, but still pans and zooms', () => {
        const props = interactionProps(
            { zoomOnScroll: false },
            { editable: false, shiftHeld: false }
        );
        expect(props.nodesDraggable).toBe(false);
        expect(props.nodesConnectable).toBe(false);
        expect(props.panOnDrag).toBe(true);
        expect(props.zoomOnPinch).toBe(true);
    });

    it('EDT-035: holding Shift snaps to the 20 px grid', () => {
        const held = interactionProps(
            { zoomOnScroll: false },
            { editable: true, shiftHeld: true }
        );
        expect(held.snapToGrid).toBe(true);
        expect(held.snapGrid).toEqual([20, 20]);
    });

    it('EDT-069: when the filter hides every table a message offers Show all', () => {
        const { store } = renderCanvas(withTables(['a', 'b']));
        act(() => store.getState().setFilter({ tableIds: [] }));
        expect(screen.getByText('All tables are hidden')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
        expect(store.getState().ui.filter).toEqual({});
        expect(screen.queryByText('All tables are hidden')).toBeNull();
    });

    it('EDT-070: a hidden table hides its relationships too', () => {
        const { design, orders, users, items } = shop();
        const input = (visible: string[]) => ({
            design,
            selection: new Set<string>(),
            visible: new Set(visible),
            live: NO_LIVE,
            flashing: new Set<string>(),
            overlapping: new Set<string>(),
            sizes: {},
            outlineOverlaps: false,
            editable: true,
        });
        expect(buildEdges(input([users, orders, items]))).toHaveLength(1);
        expect(buildEdges(input([users, items]))).toHaveLength(0);
    });

    it('EDT-073: the view refits to the visible tables after a filter change', () => {
        const { store } = renderCanvas(withTables(['a', 'b']));
        camera.fit.mockClear();
        act(() => store.getState().setFilter({ tableIds: [] }));
        expect(camera.fit).toHaveBeenCalledTimes(1);
    });

    it('EDT-086: views are drawn unless the views preference is off', () => {
        const base = shop().design;
        const asView = {
            ...base,
            entities: {
                ...base.entities,
                byId: Object.fromEntries(
                    Object.entries(base.entities.byId).map(([id, e], i) => [
                        id,
                        i === 2 ? { ...e, kind: 'view' as const } : e,
                    ])
                ),
            },
        };
        expect(drawnEntityIds(asView, () => true, true).size).toBe(3);
        expect(drawnEntityIds(asView, () => true, false).size).toBe(2);
    });
});
