import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { CHROME_CSS } from './chrome-style';
import { filterHidesSomething } from './filter-state';
import { anyOnScreen } from './geometry';
import { shortcutLabel } from './keyboard';
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

beforeEach(() => Object.values(camera).forEach((fn) => fn.mockClear()));

const bar = () => screen.getByRole('toolbar');

describe('toolbar', () => {
    it('EDT-040: the bar holds filter, show all, zoom out, zoom percentage, zoom in, auto arrange, undo and redo, in that order', () => {
        renderCanvas(shop().design, {
            canvas: { hooks: { toggleFilterPanel: vi.fn() } },
        });
        const names = within(bar())
            .getAllByRole('button')
            .map((b) => b.getAttribute('aria-label'));
        expect(names).toEqual([
            'Search & Filter',
            'Show All',
            'Zoom Out',
            'Reset zoom to 100%',
            'Zoom In',
            'Auto Arrange Diagram',
            'Undo',
            'Redo',
        ]);
    });

    it('EDT-020, EDT-021, EDT-022: plus, minus, the percentage button and show all drive the camera; the percentage follows the zoom', () => {
        const { store } = renderCanvas(shop().design);
        fireEvent.click(screen.getByLabelText('Zoom In'));
        fireEvent.click(screen.getByLabelText('Zoom Out'));
        fireEvent.click(screen.getByLabelText('Reset zoom to 100%'));
        fireEvent.click(screen.getByLabelText(/^Show All/));
        expect(camera.zoomIn).toHaveBeenCalledTimes(1);
        expect(camera.zoomOut).toHaveBeenCalledTimes(1);
        expect(camera.resetZoom).toHaveBeenCalledTimes(1);
        expect(camera.fit).toHaveBeenCalled();
        expect(screen.getByLabelText('Reset zoom to 100%')).toHaveTextContent(
            '100%'
        );
        act(() => store.getState().setZoom(0.376));
        expect(screen.getByLabelText('Reset zoom to 100%')).toHaveTextContent(
            '38%'
        );
    });

    it('EDT-041: undo and redo are disabled while their stack is empty and work when pressed', () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        const undo = screen.getByLabelText(/^Undo/);
        const redo = screen.getByLabelText(/^Redo/);
        expect(undo).toBeDisabled();
        expect(redo).toBeDisabled();
        act(() => {
            store.getState().edit({
                type: 'entity.update',
                id: s.users,
                patch: { name: 'people' },
            });
        });
        expect(undo).toBeEnabled();
        fireEvent.click(undo);
        expect(store.getState().design.entities.byId[s.users].name).toBe(
            'users'
        );
        expect(redo).toBeEnabled();
        fireEvent.click(redo);
        expect(store.getState().design.entities.byId[s.users].name).toBe(
            'people'
        );
    });

    it('EDT-042, EDT-061: the filter button is lit while a filter hides something, and it toggles the workspace panel', () => {
        const s = shop();
        const toggle = vi.fn();
        const { store } = renderCanvas(s.design, {
            canvas: { hooks: { toggleFilterPanel: toggle } },
        });
        const button = screen.getByLabelText(/^Search & Filter/);
        expect(button).toHaveAttribute('data-active', 'false');
        act(() => store.getState().setFilter({ tableIds: [s.users] }));
        expect(button).toHaveAttribute('data-active', 'true');
        expect(button.className).toContain('bg-primary');
        fireEvent.click(button);
        expect(toggle).toHaveBeenCalledTimes(1);
        expect(filterHidesSomething(s.design, {})).toBe(false);
    });

    it('EDT-043: auto arrange and snap are not offered in a read-only diagram', () => {
        renderCanvas(shop().design, { store: { readonly: true } });
        expect(screen.queryByLabelText('Auto Arrange Diagram')).toBeNull();
        expect(screen.queryByLabelText(/^Snap to Grid/)).toBeNull();
        expect(screen.getByLabelText('Zoom In')).toBeInTheDocument();
    });

    it('EDT-044: the minimap is on by default and the preference hides it', () => {
        const on = renderCanvas(shop().design);
        expect(
            on.container.querySelector('.react-flow__minimap')
        ).not.toBeNull();
        on.unmount();
        const off = renderCanvas(shop().design, {
            canvas: { prefs: { showMiniMap: false } },
        });
        expect(off.container.querySelector('.react-flow__minimap')).toBeNull();
    });

    it("EDT-271: shortcuts are written with this platform's symbols", () => {
        expect(shortcutLabel(['Mod', 'Shift', 'Z'], false)).toBe(
            'Ctrl+Shift+Z'
        );
        expect(shortcutLabel(['Mod', 'Shift', 'Z'], true)).toBe('⌘⇧Z');
        expect(shortcutLabel(['Shift'], true)).toBe('⇧');
    });
});

describe('canvas chrome', () => {
    it('EDT-035: the magnet toggles snapping and says how to snap temporarily', () => {
        renderCanvas(shop().design);
        const magnet = screen.getByLabelText('Snap to Grid (Hold Shift)');
        expect(magnet).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(magnet);
        expect(magnet).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(magnet);
        expect(magnet).toHaveAttribute('aria-pressed', 'false');
    });

    it('EDT-038: the overlap button flashes overlapping tables red for 0.6 s and puts a count pill on each', () => {
        vi.useFakeTimers();
        try {
            const s = shop();
            const apart = renderCanvas(s.design);
            expect(
                screen.queryByLabelText('Highlight Overlapping Tables')
            ).toBeNull();
            apart.unmount();

            const overlap = {
                ...s.design,
                entities: {
                    ...s.design.entities,
                    byId: {
                        ...s.design.entities.byId,
                        [s.orders]: {
                            ...s.design.entities.byId[s.orders],
                            x: 100,
                            y: 10,
                        },
                    },
                },
            };
            renderCanvas(overlap);
            const warn = screen.getByLabelText('Highlight Overlapping Tables');
            const card = screen.getByTestId(`entity-${s.users}`);
            expect(card.className).not.toContain('ring-red-500');
            fireEvent.click(warn);
            expect(card.className).toContain('ring-red-500');
            expect(
                screen.getByTestId(`entity-${s.items}`).className
            ).not.toContain('ring-red-500');
            expect(
                within(card).getByTestId(`overlap-pill-${s.users}`)
            ).toHaveTextContent('1');
            act(() => void vi.advanceTimersByTime(650));
            expect(card.className).not.toContain('ring-red-500');
            fireEvent.click(warn);
            expect(
                within(card).queryByTestId(`overlap-pill-${s.users}`)
            ).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it('EDT-039: the quiet outline on overlapping tables is optional', () => {
        const s = shop();
        const overlap = {
            ...s.design,
            entities: {
                ...s.design.entities,
                byId: {
                    ...s.design.entities.byId,
                    [s.orders]: {
                        ...s.design.entities.byId[s.orders],
                        x: 100,
                        y: 10,
                    },
                },
            },
        };
        const quiet = renderCanvas(overlap);
        expect(screen.getByTestId(`entity-${s.users}`).className).not.toContain(
            'outline-red'
        );
        quiet.unmount();
        renderCanvas(overlap, { canvas: { prefs: { outlineOverlaps: true } } });
        expect(screen.getByTestId(`entity-${s.users}`).className).toContain(
            'outline-red'
        );
        expect(screen.getByTestId(`entity-${s.items}`).className).not.toContain(
            'outline-red'
        );
    });

    it('EDT-023: with no table on screen a Show All pill offers the way back', () => {
        const box = { x: 100, y: 100, width: 224, height: 100 };
        const size = { width: 1000, height: 800 };
        expect(anyOnScreen([box], { x: 0, y: 0, zoom: 1 }, size)).toBe(true);
        expect(anyOnScreen([box], { x: -5000, y: 0, zoom: 1 }, size)).toBe(
            false
        );
        expect(anyOnScreen([box], { x: 50, y: 50, zoom: 0.1 }, size)).toBe(
            true
        );

        const s = shop();
        const far = {
            ...s.design,
            entities: {
                ...s.design.entities,
                byId: Object.fromEntries(
                    Object.entries(s.design.entities.byId).map(([id, e]) => [
                        id,
                        { ...e, x: e.x + 9000 },
                    ])
                ),
            },
        };
        renderCanvas(far);
        fireEvent.click(screen.getByTestId('show-all-pill'));
        expect(camera.fit).toHaveBeenCalled();
    });

    it('EDT-023: the pill is absent while a table is on screen', () => {
        renderCanvas(shop().design);
        expect(screen.queryByTestId('show-all-pill')).toBeNull();
    });

    it('EDT-049: a highlighter button shows while a custom type is highlighted and clears it', () => {
        const clear = vi.fn();
        const plain = renderCanvas(shop().design);
        expect(screen.queryByLabelText(/^Highlighting/)).toBeNull();
        plain.unmount();
        renderCanvas(shop().design, {
            canvas: { hooks: { highlight: { label: 'mood', clear } } },
        });
        fireEvent.click(
            screen.getByLabelText('Highlighting "mood" - click to clear')
        );
        expect(clear).toHaveBeenCalledTimes(1);
    });

    it('EDT-024: the view refits after Auto Arrange is confirmed', async () => {
        const { store } = renderCanvas(shop().design);
        fireEvent.click(screen.getByLabelText('Auto Arrange Diagram'));
        const dialog = await screen.findByRole('alertdialog');
        camera.fit.mockClear();
        fireEvent.click(
            within(dialog).getByRole('button', { name: 'Auto Arrange' })
        );
        await waitFor(() => expect(camera.fit).toHaveBeenCalledTimes(1));
        expect(store.getState().history.undo).toHaveLength(1);
    });

    it('EDT-029: while Shift is held the canvas switches to the multi-select cursor', () => {
        renderCanvas(shop().design);
        const host = screen.getByTestId('diagram-canvas');
        expect(host).toHaveAttribute('data-multiselect', 'false');
        act(
            () =>
                void fireEvent.keyDown(document, {
                    key: 'Shift',
                    code: 'ShiftLeft',
                })
        );
        expect(host).toHaveAttribute('data-multiselect', 'true');
        expect(host.className).toContain('crosshair');
        act(
            () =>
                void fireEvent.keyUp(document, {
                    key: 'Shift',
                    code: 'ShiftLeft',
                })
        );
        expect(host).toHaveAttribute('data-multiselect', 'false');
    });

    it('EDT-050: the toolbar Auto Arrange asks before it moves anything', async () => {
        const { store } = renderCanvas(shop().design);
        fireEvent.click(screen.getByLabelText('Auto Arrange Diagram'));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        expect(store.getState().history.undo).toHaveLength(0);
    });
});

describe('edit card stacking', () => {
    it('the table being edited is raised above the tables around it, so its card is never covered', () => {
        expect(CHROME_CSS).toMatch(
            /\.react-flow__node:has\(\[data-edit-card\]\)\s*\{\s*z-index:\s*1000\s*!important/
        );
    });
});

describe('cursors', () => {
    it('tables, areas and notes show the grab hand', () => {
        expect(CHROME_CSS).toMatch(
            /\.react-flow__node:hover\s*\{\s*cursor:\s*grab\s*;/
        );
    });

    it('a column row shows the pointing finger, not the grab hand of its table', () => {
        const { design, orderUser, userKey } = shop();
        renderCanvas(design);
        for (const id of [orderUser, userKey])
            expect(screen.getByTestId(`field-${id}`).className).toContain(
                'cursor-pointer'
            );
    });

    it('while a table is dragged the grabbing hand shows over all of it, rows too', () => {
        expect(CHROME_CSS).toMatch(
            /\.react-flow__node\.dragging\s*,\s*\.react-flow__node\.dragging \*\s*\{\s*cursor:\s*grabbing\s*;/
        );
    });
});
