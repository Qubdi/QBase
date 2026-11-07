import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { shop } from './test/fixtures';
import { renderCanvas } from './test/render';
import { ARROW_COMMIT_MS } from './diagram-canvas';
import { inOrder, readingOrder } from './flow-model';
import type { CanvasNode } from './flow-model';

const node = (id: string) =>
    document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`)!;

const editorHooks = {
    hooks: {
        renderEntityEditor: ({
            entityId,
            close,
        }: {
            entityId: string;
            close(): void;
        }) => (
            <div data-testid="editor">
                {entityId}
                <button type="button" onClick={close}>
                    done
                </button>
            </div>
        ),
    },
};

describe('canvas accessibility: names and roles', () => {
    it('the surface is a named group, not a bare labelled div', () => {
        renderCanvas(shop().design);
        const surface = screen.getByTestId('diagram-canvas');
        expect(surface.getAttribute('role')).toBe('group');
        expect(surface.getAttribute('aria-label')).toBe('Diagram canvas');
    });

    it('a table node is named after the table and carries the keyboard hint', () => {
        const s = shop();
        renderCanvas(s.design);
        const name = s.design.entities.byId[s.users].name;
        expect(node(s.users).getAttribute('aria-label')).toBe(name);
        const hint = document.getElementById(
            node(s.users).getAttribute('aria-describedby')!
        );
        expect(hint?.textContent).toMatch(/Enter to edit/);
    });
});

describe('canvas accessibility: keyboard on tables', () => {
    it('focusing a table selects it and says so', () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        act(() => node(s.orders).focus());
        expect(store.getState().ui.selection).toEqual([s.orders]);
        expect(screen.getByTestId('canvas-announcer').textContent).toBe(
            `${s.design.entities.byId[s.orders].name} selected`
        );
    });

    it('arrow keys move a focused table once, Shift moves it further, and it is announced', async () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        const x = () => store.getState().design.entities.byId[s.users].x;
        const start = x();
        act(() => node(s.users).focus());
        fireEvent.keyDown(node(s.users), { key: 'ArrowRight' });
        fireEvent.keyUp(node(s.users), { key: 'ArrowRight' });
        await waitFor(() => expect(x()).toBeGreaterThan(start), {
            timeout: ARROW_COMMIT_MS * 6,
        });
        const small = x() - start;
        const mid = x();
        fireEvent.keyDown(node(s.users), { key: 'ArrowRight', shiftKey: true });
        fireEvent.keyUp(node(s.users), { key: 'ArrowRight', shiftKey: true });
        await waitFor(() => expect(x()).toBeGreaterThan(mid), {
            timeout: ARROW_COMMIT_MS * 6,
        });
        expect(x() - mid).toBeGreaterThan(small);
        expect(screen.getByTestId('canvas-announcer').textContent).toContain(
            `${s.design.entities.byId[s.users].name} moved`
        );
    });

    it('Enter on a focused table opens its edit card; Escape closes it and the focus returns to the table', async () => {
        const s = shop();
        renderCanvas(s.design, { canvas: editorHooks });
        act(() => node(s.users).focus());
        fireEvent.keyDown(window, { key: 'Enter' });
        fireEvent.keyDown(node(s.users), { key: 'Enter' });
        expect(screen.getByTestId('editor')).toBeInTheDocument();
        // the card took the focus (a real one focuses its first field)
        act(() => (document.activeElement as HTMLElement).blur());
        fireEvent.keyDown(window, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByTestId('editor')).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(node(s.users)));
    });

    it('Escape pressed on the table while its card is open closes the card and keeps the focus on the table', async () => {
        const s = shop();
        renderCanvas(s.design, { canvas: editorHooks });
        act(() => node(s.users).focus());
        fireEvent.keyDown(node(s.users), { key: 'Enter' });
        expect(screen.getByTestId('editor')).toBeInTheDocument();
        fireEvent.keyDown(node(s.users), { key: 'Escape' });
        await waitFor(() => expect(screen.queryByTestId('editor')).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(node(s.users)));
        fireEvent.keyDown(node(s.users), { key: 'Escape' });
        expect(document.activeElement).toBe(
            screen.getByTestId('diagram-canvas')
        );
    });

    it('Shift+F10 and the Menu key open the pointer menu of the focused table', () => {
        const s = shop();
        renderCanvas(s.design);
        act(() => node(s.users).focus());
        fireEvent.keyDown(node(s.users), { key: 'F10', shiftKey: true });
        expect(screen.getByRole('menu')).toBeInTheDocument();
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(screen.queryByRole('menu')).toBeNull();
        fireEvent.keyDown(node(s.users), { key: 'ContextMenu' });
        expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('while a relationship is drawn, Enter on another table picks it', () => {
        const s = shop();
        const picked: string[] = [];
        const { store } = renderCanvas(s.design, {
            canvas: {
                hooks: {
                    renderLinkCard: (p) => {
                        picked.push(p.sourceEntityId, p.targetEntityId);
                        return <div data-testid="link-card" />;
                    },
                },
            },
        });
        act(() => node(s.orders).focus());
        fireEvent.keyDown(node(s.orders), { key: 'F10', shiftKey: true });
        fireEvent.click(
            screen.getByRole('menuitem', { name: /relationship/i })
        );
        expect(screen.getByTestId('link-draft')).toBeInTheDocument();
        act(() => node(s.items).focus());
        fireEvent.keyDown(node(s.items), { key: 'Enter' });
        expect(picked).toEqual([s.orders, s.items]);
        expect(store.getState().ui.selection).toEqual([s.items]);
    });

    it('Escape on a focused table gives the focus to the canvas', () => {
        const s = shop();
        renderCanvas(s.design);
        act(() => node(s.users).focus());
        fireEvent.keyDown(node(s.users), { key: 'Escape' });
        expect(document.activeElement).toBe(
            screen.getByTestId('diagram-canvas')
        );
    });
});

describe('canvas accessibility: Tab order', () => {
    const at = (id: string, x: number, y: number) =>
        ({ id, position: { x, y } }) as unknown as CanvasNode;

    it('reading order is top-left to bottom-right, rows being bands', () => {
        const nodes = [
            at('d', 0, 300),
            at('b', 300, 10),
            at('a', 0, 0),
            at('c', 600, 20),
        ];
        expect(readingOrder(nodes)).toEqual(['a', 'b', 'c', 'd']);
        expect(inOrder(nodes, ['a', 'b', 'c', 'd']).map((n) => n.id)).toEqual([
            'a',
            'b',
            'c',
            'd',
        ]);
    });

    it('the tables are in the page in reading order', () => {
        const s = shop();
        renderCanvas(s.design);
        const ids = [
            ...document.querySelectorAll('.react-flow__node-entity'),
        ].map((el) => el.getAttribute('data-id'));
        const by = s.design.entities.byId;
        const expected = [...ids].sort(
            (a, b) => by[a!].y - by[b!].y || by[a!].x - by[b!].x
        );
        expect(ids.map((i) => by[i!].x)).toEqual(expected.map((i) => by[i!].x));
    });
});
