import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { apply } from '@/core/commands/apply';
import { planDependency } from '@/core/commands/plan-dependency';
import { createEditorStore } from '@/store/editor-store';
import { deleteSelection, connectDependency } from './canvas-actions';
import { DEPENDENCY_LINE } from './dependency-style';
import {
    buildDependencyEdges,
    dimmedEntities,
    NO_LIVE,
    parseDependencyHandle,
} from './flow-model';
import { shop } from './test/fixtures';
import { renderCanvas } from './test/render';
import { LEGEND_KINDS } from './field-view';
import { NOW } from '@/core/testing/helpers';
import type { Design } from '@/core/model/design';

/** The shop with `items` turned into a view that reads `users`. */
function withDependency() {
    const s = shop();
    const viewed = apply(
        s.design,
        { type: 'entity.update', id: s.items, patch: { kind: 'view' } },
        { now: NOW }
    );
    if (!viewed.ok) throw new Error('no view');
    const plan = planDependency(viewed.design, s.items, s.users, { now: NOW });
    if (plan.kind !== 'ok') throw new Error(plan.kind);
    const done = apply(viewed.design, plan.command, { now: NOW });
    if (!done.ok) throw new Error('no dependency');
    return { s, design: done.design as Design, id: plan.dependency.id };
}

const input = (design: Design, selection: string[] = []) => ({
    design,
    selection: new Set(selection),
    visible: new Set(design.entities.order),
    live: NO_LIVE,
    flashing: new Set<string>(),
    overlapping: new Set<string>(),
    sizes: {},
    outlineOverlaps: false,
    editable: true,
});

describe('EDT-184 a dependency line', () => {
    it('is its own kind of edge from the view dot to the table dot, facing each other', () => {
        const { s, design, id } = withDependency();
        const [edge] = buildDependencyEdges(input(design));
        expect(edge).toMatchObject({
            id,
            type: 'dependency',
            source: s.items,
            target: s.users,
        });
        expect(parseDependencyHandle(edge.sourceHandle)).toBeDefined();
        expect(parseDependencyHandle(edge.targetHandle)).not.toBe(
            parseDependencyHandle(edge.sourceHandle)
        );
    });

    it('is left out when either end is hidden, and selected with its id', () => {
        const { s, design, id } = withDependency();
        const hidden = { ...input(design), visible: new Set([s.items]) };
        expect(buildDependencyEdges(hidden)).toEqual([]);
        expect(buildDependencyEdges(input(design, [id]))[0].selected).toBe(
            true
        );
    });

    it('keeps its two tables out of the dimmed set when one is selected', () => {
        const { s, design } = withDependency();
        const dim = dimmedEntities(design, new Set([s.items]));
        expect(dim.has(s.users)).toBe(false);
    });

    it('is drawn dashed on the canvas, in the one place that styles it', async () => {
        const { design, id } = withDependency();
        const { container } = renderCanvas(design);
        await waitFor(() => {
            const path = container.querySelector(
                `[data-id="${id}"] path.react-flow__edge-path`
            );
            expect(path).not.toBeNull();
            expect(path!.getAttribute('style')).toContain(
                `stroke-dasharray: ${DEPENDENCY_LINE.dash}`
            );
        });
    });

    it('only a view offers the top and bottom dots as connectable', async () => {
        const { s, design } = withDependency();
        const { container } = renderCanvas(design);
        await waitFor(() =>
            expect(
                container.querySelector(
                    `[data-id="${s.items}"] .react-flow__handle`
                )
            ).not.toBeNull()
        );
        const connectable = (id: string) =>
            container.querySelectorAll(
                `[data-id="${id}"] .react-flow__handle-top.connectable, [data-id="${id}"] .react-flow__handle-bottom.connectable`
            ).length;
        expect(connectable(s.items)).toBe(2);
        expect(connectable(s.users)).toBe(0);
    });
});

describe('EDT-183 EDT-185 EDT-186 making and deleting by hand', () => {
    it('a drag from a view onto a table creates it; a table cannot start one', () => {
        const s = shop();
        const viewed = apply(
            s.design,
            { type: 'entity.update', id: s.items, patch: { kind: 'view' } },
            { now: NOW }
        );
        if (!viewed.ok) throw new Error('no view');
        const store = createEditorStore({ design: viewed.design });
        expect(connectDependency(store, s.users, s.orders)).toBeUndefined();
        const id = connectDependency(store, s.items, s.users);
        expect(store.getState().design.dependencies.map((d) => d.id)).toEqual([
            id,
        ]);
        // dropping on the same table again makes nothing new
        expect(connectDependency(store, s.items, s.users)).toBeUndefined();
        store.getState().undo();
        expect(store.getState().design.dependencies).toEqual([]);
    });

    it('Delete on the selected line removes it, and undo brings it back', () => {
        const { design, id } = withDependency();
        const store = createEditorStore({ design });
        store.getState().select([id]);
        expect(deleteSelection(store)).toBe(true);
        expect(store.getState().design.dependencies).toEqual([]);
        store.getState().undo();
        expect(store.getState().design.dependencies).toHaveLength(1);
    });

    it('deleting the view takes the line in the same undo step', () => {
        const { s, design } = withDependency();
        const store = createEditorStore({ design });
        store.getState().select([s.items]);
        deleteSelection(store);
        expect(store.getState().design.dependencies).toEqual([]);
        store.getState().undo();
        expect(store.getState().design.entities.byId[s.items]).toBeDefined();
        expect(store.getState().design.dependencies).toHaveLength(1);
    });
});

describe('EDT-045 the Type colours legend', () => {
    it('is a top-right button listing the six tints, hidden on a phone by the stylesheet', async () => {
        const { container } = renderCanvas(shop().design);
        const legend = container.querySelector('.qb-legend');
        expect(legend).not.toBeNull();
        expect(LEGEND_KINDS).toHaveLength(6);
        act(() => screen.getByRole('button', { name: 'Type colours' }).click());
        await waitFor(() =>
            expect(
                document.querySelectorAll('[data-kind]').length
            ).toBeGreaterThan(5)
        );
        for (const name of [
            'Text / other',
            'Number',
            'Date & time',
            'Identifier',
            'Boolean',
            'JSON / XML',
        ])
            expect(screen.getByText(name)).toBeTruthy();
        expect(
            document.querySelector('[data-testid="canvas-chrome-style"]')!
                .textContent
        ).toMatch(/max-width: 767px\)\s*\{\s*\.qb-legend \{ display:none/);
    });
});

describe('EDT-196 Highlight Fields on the canvas', () => {
    it('tints every field using the type, one type at a time, and clears', async () => {
        const s = shop();
        const added = apply(
            s.design,
            {
                type: 'item.insert',
                collection: 'userTypes',
                item: { id: 'ut1', name: 'mood', kind: 'enum', values: [] },
            },
            { now: NOW }
        );
        if (!added.ok) throw new Error('no type');
        const column = added.design.columns[s.orderUser];
        const used = apply(
            added.design,
            {
                type: 'part.update',
                entityId: s.orders,
                part: 'columns',
                id: column.id,
                patch: { type: { id: 'mood', name: 'mood' } },
            },
            { now: NOW }
        );
        if (!used.ok) throw new Error('no use');
        const { store } = renderCanvas(used.design);
        const row = () => screen.getByTestId(`field-${s.orderUser}`);
        await waitFor(() => expect(row()).toBeTruthy());
        expect(row().getAttribute('data-highlighted')).toBeNull();
        act(() => store.getState().setHighlightedType('ut1'));
        expect(row().getAttribute('data-highlighted')).toBe('true');
        const others = document.querySelectorAll('[data-highlighted]');
        expect(others).toHaveLength(1);
        act(() => store.getState().setHighlightedType(undefined));
        expect(document.querySelectorAll('[data-highlighted]')).toHaveLength(0);
    });
});
