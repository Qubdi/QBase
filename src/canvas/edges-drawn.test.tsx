import { afterEach, describe, expect, it } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { planLink } from '@/core/commands/plan-link';
import { shop } from './test/fixtures';
import { renderCanvas } from './test/render';

const paths = (root: HTMLElement) => [
    ...root.querySelectorAll('.react-flow__edge path.react-flow__edge-path'),
];

const realObserver = globalThis.ResizeObserver;
afterEach(() => {
    globalThis.ResizeObserver = realObserver;
});

const expectDrawn = (root: HTMLElement, count = 1) => {
    const found = paths(root);
    expect(found).toHaveLength(count);
    for (const path of found) {
        const d = path.getAttribute('d') ?? '';
        expect(d).toMatch(/^M\s*-?\d/);
        expect(d).not.toContain('NaN');
    }
};

describe('lines are drawn', () => {
    it('EDT-171: two tables and one link give an edge path with a real d', async () => {
        const { container } = renderCanvas(shop().design);
        await waitFor(() => expectDrawn(container));
    });

    it('EDT-171: the line is still drawn after the canvas rebuilds its nodes (select, move)', async () => {
        const s = shop();
        const { container, store } = renderCanvas(s.design);
        await waitFor(() => expectDrawn(container));
        act(() => store.getState().select([s.users]));
        await waitFor(() => expectDrawn(container));
        act(() => void store.getState().select([]));
        act(() => {
            store.getState().edit({
                type: 'entity.move',
                moves: [{ id: s.orders, x: 320, y: 40 }],
            });
        });
        await waitFor(() => expectDrawn(container));
        act(
            () =>
                void store.getState().edit({
                    type: 'entity.update',
                    id: s.users,
                    patch: { width: 300 },
                })
        );
        await waitFor(() => expectDrawn(container));
    });

    it('EDT-153: a link added after the tables are drawn is drawn too', async () => {
        const s = shop();
        const without = {
            ...s.design,
            links: { byId: {}, order: [] },
        };
        const { container, store } = renderCanvas(without);
        await waitFor(() =>
            expect(
                container.querySelectorAll('.react-flow__node')
            ).toHaveLength(3)
        );
        expect(paths(container)).toHaveLength(0);
        const plan = planLink(
            store.getState().design,
            { entityId: s.users, columnId: s.userKey },
            { entityId: s.orders, columnId: s.orderUser }
        );
        if (plan.kind !== 'ok') throw new Error('no plan');
        act(() => void store.getState().edit(plan.command));
        await waitFor(() => expectDrawn(container));
    });

    it('EDT-171: tables not yet measured draw their line once they are', async () => {
        // an observer that stays silent until told, like a browser before layout
        const pending: Array<() => void> = [];
        let released = false;
        globalThis.ResizeObserver = class {
            constructor(private readonly cb: ResizeObserverCallback) {}
            observe(target: Element) {
                const fire = () =>
                    this.cb(
                        [
                            {
                                target,
                                contentRect: target.getBoundingClientRect(),
                            },
                        ] as never,
                        this as never
                    );
                if (released) queueMicrotask(fire);
                else pending.push(fire);
            }
            unobserve() {}
            disconnect() {}
        } as never;
        const { container } = renderCanvas(shop().design);
        expect(paths(container)).toHaveLength(0);
        act(() => {
            released = true;
            pending.splice(0).forEach((run) => run());
        });
        await waitFor(() => expectDrawn(container));
    });

    it('EDT-245: the line is still drawn when a design swaps the field ids but keeps the table sizes (DBML accept)', async () => {
        const s = shop();
        const { container, store } = renderCanvas(s.design);
        await waitFor(() => expectDrawn(container));
        // like accepting a DBML change: same tables and fields, new field ids
        const renamed = JSON.parse(
            JSON.stringify(s.design)
                .replaceAll(s.userKey, 'new-user-key')
                .replaceAll(s.orderUser, 'new-order-user')
        );
        act(() => store.getState().replaceDesign(renamed, { history: 'step' }));
        await waitFor(() => expectDrawn(container));
        expect(
            container.querySelector('[data-testid="field-new-user-key"]')
        ).not.toBeNull();
    });
});
