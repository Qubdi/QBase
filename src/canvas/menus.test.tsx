import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { createEditorStore } from '@/store/editor-store';
import { toast } from '@/platform/toast/use-toast';
import {
    copySelection,
    deleteSelection,
    pasteClipboard,
} from './canvas-actions';
import { forgetClipboard } from './clipboard';
import { dropNewItem } from './drop-items';
import { buildMenu, menuTargets } from './menu-model';
import type { MenuLine } from './menu-model';
import { runMenuAction } from './menu-actions';
import { PointerMenu } from './pointer-menu';
import { pasteKeyLabel } from './notify';
import { sizeFor } from './geometry';
import { shop, withMemo, withRegion } from './test/fixtures';
import { renderCanvas } from './test/render';

vi.mock('@/platform/toast/use-toast', () => ({ toast: vi.fn() }));

beforeEach(() => {
    vi.mocked(toast).mockClear();
    forgetClipboard();
});

/** happy-dom builds touch events without their points, so they are added by hand. */
function touch(target: Element, type: string, x: number, y: number) {
    const event = new Event(type, { bubbles: true });
    const points = [{ clientX: x, clientY: y, identifier: 1, target }];
    for (const key of ['touches', 'changedTouches', 'targetTouches'])
        Object.defineProperty(event, key, { value: points });
    target.dispatchEvent(event);
}

const measure = (e: Parameters<typeof sizeFor>[0]) => sizeFor(e, {});
const labels = (lines: MenuLine[]) =>
    lines.flatMap((l) => (l.kind === 'item' ? [l.verbatim ?? l.label] : []));
const context = (
    over: Partial<Parameters<typeof buildMenu>[0]> & {
        design: Parameters<typeof buildMenu>[0]['design'];
    }
) => ({
    selection: [] as string[],
    target: { kind: 'pane' as const },
    at: { x: 5, y: 6 },
    showViews: true,
    canOpenLinkDialog: true,
    canEditEntity: true,
    ...over,
});

describe('right-click menus', () => {
    it('EDT-054: the background menu offers new table, view, relationship, area, note and auto arrange', () => {
        const lines = buildMenu(context({ design: shop().design }));
        expect(labels(lines)).toEqual([
            'newTable',
            'newView',
            'newRelationship',
            'newArea',
            'newNote',
            'arrange',
        ]);
        expect(lines.some((l) => l.kind === 'separator')).toBe(true);
    });

    it('EDT-054: New view is offered only while views are drawn; New relationship only if the workspace can open its dialog', () => {
        const lines = buildMenu(
            context({
                design: shop().design,
                showViews: false,
                canOpenLinkDialog: false,
            })
        );
        expect(labels(lines)).toEqual([
            'newTable',
            'newArea',
            'newNote',
            'arrange',
        ]);
    });

    it('EDT-055: a table made from the menu lands at the pointer in the default schema and opens for editing', () => {
        const s = shop();
        const store = createEditorStore({ design: s.design });
        const startEditing = vi.fn();
        runMenuAction(
            { type: 'new-entity', kind: 'table', at: { x: 1400.2, y: 900.7 } },
            {
                store,
                measure,
                drawn: new Set(),
                startEditing,
                startRename: vi.fn(),
                beginLink: vi.fn(),
                askArrange: vi.fn(),
            }
        );
        const state = store.getState();
        const made =
            state.design.entities.byId[state.design.entities.order.at(-1)!];
        expect([made.x, made.y]).toEqual([1400, 901]);
        expect(made.schema).toBe('public');
        expect(made.name).toBe('table_4');
        expect(startEditing).toHaveBeenCalledWith(made.id);
    });

    it('EDT-056: with tables selected the background menu adds Move to area (n) with the areas and New area', () => {
        const s = shop();
        const placed = withRegion(
            s.design,
            { x: 900, y: 0, width: 300, height: 200 },
            'Billing'
        );
        const lines = buildMenu(
            context({ design: placed.design, selection: [s.users, s.orders] })
        );
        const move = lines.find(
            (l) => l.kind === 'item' && l.label === 'moveToAreaCount'
        );
        expect(move && move.kind === 'item' && move.values).toEqual({
            count: 2,
        });
        expect(
            labels(move && move.kind === 'item' ? move.submenu! : [])
        ).toEqual(['Billing', 'newArea']);
        expect(
            labels(buildMenu(context({ design: placed.design })))
        ).not.toContain('moveToAreaCount');
    });

    it('EDT-057: a table menu offers edit, duplicate, add relationship, move to area and delete', () => {
        const s = shop();
        const lines = buildMenu(
            context({
                design: s.design,
                target: { kind: 'entity', id: s.users },
            })
        );
        expect(labels(lines)).toEqual([
            'editTable',
            'duplicateTable',
            'addRelationship',
            'moveToArea',
            'deleteTable',
        ]);
    });

    it('EDT-157: a view cannot start a relationship', () => {
        const s = shop();
        const asView = {
            ...s.design,
            entities: {
                ...s.design.entities,
                byId: {
                    ...s.design.entities.byId,
                    [s.items]: {
                        ...s.design.entities.byId[s.items],
                        kind: 'view' as const,
                    },
                },
            },
        };
        const lines = buildMenu(
            context({ design: asView, target: { kind: 'entity', id: s.items } })
        );
        expect(labels(lines)).not.toContain('addRelationship');
    });

    it('EDT-058: with several tables selected the table menu acts on all of them', () => {
        const s = shop();
        const selection = [s.users, s.orders];
        expect(menuTargets(s.design, selection, s.users)).toEqual([
            s.users,
            s.orders,
        ]);
        expect(menuTargets(s.design, selection, s.items)).toEqual([s.items]);
        const lines = buildMenu(
            context({
                design: s.design,
                selection,
                target: { kind: 'entity', id: s.users },
            })
        );
        const move = lines.find(
            (l) => l.kind === 'item' && l.label === 'moveToAreaCount'
        );
        expect(move && move.kind === 'item' && move.values).toEqual({
            count: 2,
        });
        const del = lines.find(
            (l) => l.kind === 'item' && l.label === 'deleteTables'
        );
        expect(del && del.kind === 'item' && del.action).toEqual({
            type: 'delete-entities',
            ids: [s.users, s.orders],
        });
    });

    it('EDT-059: No area is disabled when none of the tables has an area', () => {
        const s = shop();
        const placed = withRegion(
            s.design,
            { x: 900, y: 0, width: 300, height: 200 },
            'Billing'
        );
        const noArea = (design: typeof placed.design) => {
            const lines = buildMenu(
                context({ design, target: { kind: 'entity', id: s.users } })
            );
            const move = lines.find(
                (l) => l.kind === 'item' && l.label === 'moveToArea'
            );
            const sub = move && move.kind === 'item' ? move.submenu! : [];
            return sub.find((l) => l.kind === 'item' && l.label === 'noArea');
        };
        expect(noArea(placed.design)).toMatchObject({ disabled: true });
        const inside = {
            ...placed.design,
            entities: {
                ...placed.design.entities,
                byId: {
                    ...placed.design.entities.byId,
                    [s.users]: {
                        ...placed.design.entities.byId[s.users],
                        regionId: placed.regionId,
                    },
                },
            },
        };
        expect(noArea(inside)).toMatchObject({ disabled: false });
    });

    it('EDT-060: an area menu offers edit name, auto arrange and delete', () => {
        const s = shop();
        const placed = withRegion(s.design, {
            x: 0,
            y: 0,
            width: 300,
            height: 200,
        });
        expect(
            labels(
                buildMenu(
                    context({
                        design: placed.design,
                        target: { kind: 'region', id: placed.regionId },
                    })
                )
            )
        ).toEqual(['editAreaName', 'arrangeArea', 'deleteArea']);
    });

    it('EDT-060: a note has no menu', () => {
        const added = withMemo(shop().design);
        expect(
            buildMenu(
                context({
                    design: added.design,
                    target: { kind: 'memo', id: added.memoId },
                })
            )
        ).toEqual([]);
    });

    it('EDT-014: no right-click menu in a read-only diagram', () => {
        const { container } = renderCanvas(shop().design, {
            store: { readonly: true },
        });
        fireEvent.contextMenu(container.querySelector('.react-flow__pane')!);
        expect(screen.queryByTestId('pointer-menu')).toBeNull();
    });

    it('EDT-054: right-clicking the background shows the menu and New table creates a table', () => {
        const { container, store } = renderCanvas(shop().design);
        fireEvent.contextMenu(container.querySelector('.react-flow__pane')!, {
            clientX: 50,
            clientY: 60,
        });
        const menu = screen.getByTestId('pointer-menu');
        expect(within(menu).getByText('New table')).toBeInTheDocument();
        expect(
            within(menu).getByText('Auto arrange diagram')
        ).toBeInTheDocument();
        fireEvent.click(within(menu).getByText('New table'));
        expect(store.getState().design.entities.order).toHaveLength(4);
        expect(screen.queryByTestId('pointer-menu')).toBeNull();
    });

    it('EDT-057, EDT-099: Duplicate table in the table menu adds a copy near the original, clear of other tables', () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        const card = screen
            .getByTestId(`entity-${s.orders}`)
            .closest('.react-flow__node')!;
        fireEvent.contextMenu(card);
        fireEvent.click(
            within(screen.getByTestId('pointer-menu')).getByText(
                'Duplicate table'
            )
        );
        const state = store.getState().design;
        const copy = state.entities.byId[state.entities.order.at(-1)!];
        expect(copy.name).toBe('orders_copy');
        // 30 right and 50 down would land on the other tables, so it slides clear
        expect(copy.x).toBe(330);
        expect(copy.y).toBeGreaterThanOrEqual(50);
        expect(copy.y).toBeGreaterThanOrEqual(80);
    });

    it('EDT-100: Delete table removes the table and its links in one undo step', () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        fireEvent.contextMenu(
            screen
                .getByTestId(`entity-${s.users}`)
                .closest('.react-flow__node')!
        );
        fireEvent.click(
            within(screen.getByTestId('pointer-menu')).getByText('Delete table')
        );
        expect(store.getState().design.entities.order).toHaveLength(2);
        expect(store.getState().design.links.order).toHaveLength(0);
        act(() => void store.getState().undo());
        expect(store.getState().design.entities.order).toHaveLength(3);
        expect(store.getState().design.links.order).toEqual([s.link]);
    });

    it('EDT-056: Move to area (n) opens its list and New area creates an area holding the tables, as one step', () => {
        const s = shop();
        const { container, store } = renderCanvas(s.design);
        act(() => store.getState().select([s.users, s.items]));
        fireEvent.contextMenu(container.querySelector('.react-flow__pane')!, {
            clientX: 700,
            clientY: 700,
        });
        fireEvent.click(screen.getByText('Move to area (2)'));
        fireEvent.click(
            within(screen.getByTestId('pointer-menu'))
                .getAllByText('New area')
                .pop()!
        );
        const state = store.getState().design;
        expect(state.regions.order).toHaveLength(1);
        expect(state.entities.byId[s.users].regionId).toBe(
            state.regions.order[0]
        );
        expect(state.entities.byId[s.items].regionId).toBe(
            state.regions.order[0]
        );
        expect(store.getState().history.undo).toHaveLength(1);
    });

    it('EDT-050: Auto arrange asks first, with Auto arrange and Cancel; Cancel changes nothing, confirming rearranges', async () => {
        const s = shop();
        const { container, store } = renderCanvas(s.design);
        const open = () => {
            fireEvent.contextMenu(
                container.querySelector('.react-flow__pane')!
            );
            fireEvent.click(screen.getByText('Auto arrange diagram'));
        };
        open();
        const dialog = await screen.findByRole('alertdialog');
        expect(
            within(dialog).getByText('Auto arrange diagram')
        ).toBeInTheDocument();
        expect(
            within(dialog).getByText(/rearrange all tables/)
        ).toBeInTheDocument();
        fireEvent.click(within(dialog).getByText('Cancel'));
        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).toBeNull()
        );
        expect(store.getState().history.undo).toHaveLength(0);

        open();
        fireEvent.click(
            within(await screen.findByRole('alertdialog')).getByRole('button', {
                name: 'Auto arrange',
            })
        );
        await waitFor(() =>
            expect(store.getState().history.undo).toHaveLength(1)
        );
    });

    it('EDT-009: holding a finger still on the canvas opens the same menu', () => {
        vi.useFakeTimers();
        try {
            const { container } = renderCanvas(shop().design);
            const pane = container.querySelector('.react-flow__pane')!;
            touch(pane, 'touchstart', 30, 40);
            act(() => void vi.advanceTimersByTime(700));
            expect(screen.getByTestId('pointer-menu')).toBeInTheDocument();
            // the press and click the browser sends when the finger is lifted
            // must not close the menu the hold opened (found on a phone)
            fireEvent.mouseDown(document.body);
            expect(screen.getByTestId('pointer-menu')).toBeInTheDocument();
            touch(pane, 'touchend', 30, 40);
            fireEvent.mouseDown(document.body);
            fireEvent.click(pane);
            expect(screen.getByTestId('pointer-menu')).toBeInTheDocument();
            act(() => void vi.advanceTimersByTime(700));
            fireEvent.mouseDown(document.body);
            expect(screen.queryByTestId('pointer-menu')).toBeNull();
            touch(pane, 'touchstart', 30, 40);
            touch(pane, 'touchmove', 90, 40);
            act(() => void vi.advanceTimersByTime(700));
            expect(screen.queryByTestId('pointer-menu')).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('the menu stays inside the window', () => {
    it('is moved left when the pointer is near the right edge', () => {
        const rect = vi
            .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
            .mockReturnValue({
                width: 180,
                height: 100,
                x: 0,
                y: 0,
                top: 0,
                left: 0,
                right: 180,
                bottom: 100,
                toJSON: () => ({}),
            });
        const wide = window.innerWidth;
        window.innerWidth = 390;
        try {
            const { container } = renderCanvas(shop().design);
            const pane = container.querySelector('.react-flow__pane')!;
            fireEvent.contextMenu(pane, { clientX: 350, clientY: 40 });
            const menu = screen.getByTestId('pointer-menu');
            expect(menu.style.left).toBe('202px');
        } finally {
            window.innerWidth = wide;
            rect.mockRestore();
        }
    });
});

describe('drawing a relationship from a table', () => {
    it('EDT-158, EDT-162: Add relationship draws a line; Escape cancels it', async () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        fireEvent.contextMenu(
            screen
                .getByTestId(`entity-${s.users}`)
                .closest('.react-flow__node')!
        );
        fireEvent.click(
            within(screen.getByTestId('pointer-menu')).getByText(
                'Add relationship'
            )
        );
        expect(screen.getByTestId('link-draft')).toBeInTheDocument();
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(screen.queryByTestId('link-draft')).toBeNull();
        expect(store.getState().design.links.order).toHaveLength(1);
    });

    it('EDT-162: clicking the empty background cancels it too', () => {
        const s = shop();
        const { container } = renderCanvas(s.design);
        fireEvent.contextMenu(
            screen
                .getByTestId(`entity-${s.users}`)
                .closest('.react-flow__node')!
        );
        fireEvent.click(
            within(screen.getByTestId('pointer-menu')).getByText(
                'Add relationship'
            )
        );
        fireEvent.click(container.querySelector('.react-flow__pane')!);
        expect(screen.queryByTestId('link-draft')).toBeNull();
    });

    it('EDT-159, EDT-160: clicking a target table hands the workspace a card with both tables', () => {
        const s = shop();
        const renderLinkCard = vi.fn(() => <div>card</div>);
        renderCanvas(s.design, { canvas: { hooks: { renderLinkCard } } });
        fireEvent.contextMenu(
            screen
                .getByTestId(`entity-${s.users}`)
                .closest('.react-flow__node')!
        );
        fireEvent.click(
            within(screen.getByTestId('pointer-menu')).getByText(
                'Add relationship'
            )
        );
        fireEvent.click(
            screen
                .getByTestId(`entity-${s.items}`)
                .closest('.react-flow__node')!,
            { clientX: 77, clientY: 88 }
        );
        expect(screen.getByText('card')).toBeInTheDocument();
        expect(renderLinkCard).toHaveBeenLastCalledWith(
            expect.objectContaining({
                sourceEntityId: s.users,
                targetEntityId: s.items,
                anchor: { x: 77, y: 88 },
            })
        );
        expect(screen.queryByTestId('link-draft')).toBeNull();
    });

    it('EDT-160: without a card the suggested field is used and the new line is selected', () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        fireEvent.contextMenu(
            screen
                .getByTestId(`entity-${s.users}`)
                .closest('.react-flow__node')!
        );
        fireEvent.click(
            within(screen.getByTestId('pointer-menu')).getByText(
                'Add relationship'
            )
        );
        fireEvent.click(
            screen
                .getByTestId(`entity-${s.items}`)
                .closest('.react-flow__node')!
        );
        const state = store.getState();
        expect(state.design.links.order).toHaveLength(2);
        expect(state.ui.selection).toEqual([state.design.links.order[1]]);
    });
});

describe('copy and paste', () => {
    it('EDT-227: Mod+C remembers the selected tables; the toast names the platform key (EDT-228)', () => {
        const s = shop();
        const store = createEditorStore({ design: s.design });
        store.getState().select([s.users, s.orders]);
        expect(copySelection(store)).toBe(2);
        store.getState().select([]);
        expect(copySelection(store)).toBe(0);
        expect(pasteKeyLabel()).toMatch(/Ctrl\+V|⌘V/);
    });

    it('EDT-227, EDT-228, EDT-235: the keys copy and paste on the canvas and tell the person', () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        act(() => store.getState().select([s.users]));
        fireEvent.keyDown(document.body, { key: 'c', ctrlKey: true });
        expect(toast).toHaveBeenLastCalledWith(
            expect.objectContaining({
                title: 'Table copied',
                description: `Press ${pasteKeyLabel()} to paste it.`,
            })
        );
        fireEvent.keyDown(document.body, { key: 'v', ctrlKey: true });
        expect(toast).toHaveBeenLastCalledWith(
            expect.objectContaining({ title: 'Table pasted' })
        );
        expect(store.getState().design.entities.order).toHaveLength(4);
    });

    it('EDT-229: copy is ignored when page text is selected or the person is typing', () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        act(() => store.getState().select([s.users]));
        const input = document.createElement('input');
        document.body.append(input);
        fireEvent.keyDown(input, { key: 'c', ctrlKey: true });
        expect(toast).not.toHaveBeenCalled();
        input.remove();
        const spy = vi
            .spyOn(window, 'getSelection')
            .mockReturnValue({ toString: () => 'abc' } as never);
        fireEvent.keyDown(document.body, { key: 'c', ctrlKey: true });
        expect(toast).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it('EDT-230, EDT-231, EDT-234: a paste makes new copies with new ids, _copy names and no links', () => {
        const s = shop();
        const store = createEditorStore({ design: s.design });
        store.getState().select([s.orders]);
        copySelection(store);
        expect(pasteClipboard(store)).toBe(1);
        const state = store.getState().design;
        const copy = state.entities.byId[state.entities.order.at(-1)!];
        expect(copy.id).not.toBe(s.orders);
        expect(copy.name).toBe('orders_copy');
        expect(state.links.order).toEqual([s.link]);
        expect(pasteClipboard(store)).toBe(1);
        const again = store.getState().design;
        expect(again.entities.byId[again.entities.order.at(-1)!].name).toBe(
            'orders_copy2'
        );
    });

    it('EDT-232: each further paste of the same copy lands one slot further right', () => {
        const s = shop();
        const store = createEditorStore({ design: s.design });
        store.getState().select([s.users]);
        copySelection(store);
        pasteClipboard(store);
        pasteClipboard(store);
        const d = store.getState().design;
        const [first, second] = d.entities.order
            .slice(-2)
            .map((id) => d.entities.byId[id].x);
        expect(first).toBe(224 + 40);
        expect(second).toBe((224 + 40) * 2);
    });

    it('EDT-236: the clipboard lives in the page, so another diagram can paste it', () => {
        const a = shop();
        const storeA = createEditorStore({ design: a.design });
        storeA.getState().select([a.users]);
        copySelection(storeA);
        const b = createEditorStore({ design: shop().design });
        expect(pasteClipboard(b)).toBe(1);
        expect(b.getState().design.entities.order).toHaveLength(4);
    });

    it('EDT-237: paste does nothing in a read-only diagram', () => {
        const a = shop();
        const storeA = createEditorStore({ design: a.design });
        storeA.getState().select([a.users]);
        copySelection(storeA);
        const locked = createEditorStore({
            design: shop().design,
            readonly: true,
        });
        expect(pasteClipboard(locked)).toBe(0);
    });
});

describe('keyboard delete and drops', () => {
    it('EDT-031, EDT-267: Delete removes everything selected; typing in a box is not touched', () => {
        const s = shop();
        const placed = withRegion(s.design, {
            x: 900,
            y: 900,
            width: 300,
            height: 200,
        });
        const { store } = renderCanvas(placed.design);
        act(() => store.getState().select([s.users, placed.regionId]));
        const input = document.createElement('input');
        document.body.append(input);
        fireEvent.keyDown(input, { key: 'Delete' });
        expect(store.getState().design.entities.order).toHaveLength(3);
        input.remove();
        fireEvent.keyDown(document.body, { key: 'Backspace' });
        const state = store.getState();
        expect(state.design.entities.order).toHaveLength(2);
        expect(state.design.regions.order).toHaveLength(0);
        expect(state.design.links.order).toHaveLength(0);
        expect(state.ui.selection).toEqual([]);
        expect(state.history.undo).toHaveLength(1);
    });

    it('EDT-031: nothing is deleted in a read-only diagram', () => {
        const s = shop();
        const { store } = renderCanvas(s.design, { store: { readonly: true } });
        act(() => store.getState().select([s.users]));
        fireEvent.keyDown(document.body, { key: 'Delete' });
        expect(store.getState().design.entities.order).toHaveLength(3);
        expect(deleteSelection(store)).toBe(false);
    });

    it('a new item dropped from outside is created where it lands', () => {
        const store = createEditorStore({ design: shop().design });
        expect(dropNewItem(store, 'table', { x: 10, y: 20 })).toBe(true);
        expect(dropNewItem(store, 'view', { x: 10, y: 20 })).toBe(true);
        expect(dropNewItem(store, 'area', { x: 10, y: 20 })).toBe(true);
        expect(dropNewItem(store, 'note', { x: 10, y: 20 })).toBe(true);
        expect(dropNewItem(store, 'file', { x: 10, y: 20 })).toBe(false);
        const d = store.getState().design;
        expect(d.entities.order).toHaveLength(5);
        expect(d.regions.order).toHaveLength(1);
        expect(d.memos.order).toHaveLength(1);
    });
});

describe('review ui 13: the pointer menu is keyboard operable', () => {
    it('focuses the first item, moves with the arrows and gives the focus back on close', () => {
        const button = document.createElement('button');
        document.body.append(button);
        button.focus();
        const view = render(
            <PointerMenu
                at={{ x: 10, y: 10 }}
                lines={[
                    { kind: 'item', label: 'one', verbatim: 'One' },
                    { kind: 'item', label: 'two', verbatim: 'Two' },
                ]}
                onPick={() => undefined}
                onClose={() => undefined}
            />
        );
        const items = screen.getAllByRole('menuitem');
        expect(document.activeElement).toBe(items[0]);
        fireEvent.keyDown(items[0], { key: 'ArrowDown' });
        expect(document.activeElement).toBe(items[1]);
        fireEvent.keyDown(items[1], { key: 'ArrowDown' });
        expect(document.activeElement).toBe(items[0]);
        view.unmount();
        expect(document.activeElement).toBe(button);
        button.remove();
    });
});
