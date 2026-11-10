import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { createEditorStore } from '@/store/editor-store';
import { planAddColumn } from '@/core/commands/plan-column';
import { toast } from '@/platform/toast/use-toast';
import {
    connectColumns,
    connectFromDrop,
    connectFromHandles,
    isUsableConnection,
} from './canvas-actions';
import {
    buildEdges,
    chooseSides,
    handleId,
    NO_LIVE,
    parseHandle,
} from './flow-model';
import { commitQuickLink, planQuickLink, suggestTarget } from './link-draft';
import { reportConnect } from './notify';
import { shop } from './test/fixtures';
import { renderCanvas } from './test/render';

vi.mock('@/platform/toast/use-toast', () => ({ toast: vi.fn() }));

beforeEach(() => vi.mocked(toast).mockClear());

const edgeInput = (s: ReturnType<typeof shop>, selection: string[] = []) => ({
    design: s.design,
    selection: new Set(selection),
    visible: new Set([s.users, s.orders, s.items]),
    live: NO_LIVE,
    flashing: new Set<string>(),
    overlapping: new Set<string>(),
    sizes: {},
    outlineOverlaps: false,
    editable: true,
});

describe('creating links by dragging from field to field', () => {
    it("EDT-153, EDT-167: releasing on another table's field creates a one-to-one link named table_field_fk, first field as source", () => {
        const s = shop();
        const store = createEditorStore({ design: s.design });
        const extra = planAddColumn(s.design, s.items, { name: 'order_id' });
        store.getState().edit(extra!);
        const itemsCol = store
            .getState()
            .design.entities.byId[s.items].columnIds.at(-1)!;
        const out = connectColumns(
            store,
            {
                entityId: s.orders,
                columnId: s.design.entities.byId[s.orders].columnIds[0],
            },
            { entityId: s.items, columnId: itemsCol }
        );
        expect(out.kind).toBe('created');
        const links = store.getState().design.links;
        expect(links.order).toHaveLength(2);
        const link = links.byId[links.order[1]];
        expect(link.name).toBe('orders_id_fk');
        expect([link.sourceCardinality, link.targetCardinality]).toEqual([
            'one',
            'one',
        ]);
        expect(link.sourceEntityId).toBe(s.orders);
    });

    it('EDT-154: incompatible types create nothing and give the red toast', () => {
        const s = shop();
        const store = createEditorStore({ design: s.design });
        store.getState().edit(
            planAddColumn(s.design, s.items, {
                name: 'label',
                type: { id: 'text', name: 'text' },
            })!
        );
        const textCol = store
            .getState()
            .design.entities.byId[s.items].columnIds.at(-1)!;
        const out = connectColumns(
            store,
            { entityId: s.users, columnId: s.userKey },
            { entityId: s.items, columnId: textCol }
        );
        expect(out.kind).toBe('incompatible');
        expect(store.getState().design.links.order).toHaveLength(1);
        reportConnect(out);
        expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({
                variant: 'destructive',
                title: 'Field types are not compatible',
                description:
                    'Relationships can only be created between compatible field types',
            })
        );
    });

    it('EDT-155, EDT-168: a pair that is already joined, in either direction, says so and adds nothing', () => {
        const s = shop();
        const store = createEditorStore({ design: s.design });
        const forward = connectColumns(
            store,
            { entityId: s.users, columnId: s.userKey },
            { entityId: s.orders, columnId: s.orderUser }
        );
        const backward = connectColumns(
            store,
            { entityId: s.orders, columnId: s.orderUser },
            { entityId: s.users, columnId: s.userKey }
        );
        expect(forward).toEqual({ kind: 'exists', linkId: s.link });
        expect(backward).toEqual({ kind: 'exists', linkId: s.link });
        expect(store.getState().design.links.order).toHaveLength(1);
        reportConnect(backward);
        expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Already connected',
                description:
                    'These two fields already have a relationship between them',
            })
        );
    });

    it('EDT-156: a connection with no field dot at the end creates nothing', () => {
        const s = shop();
        const store = createEditorStore({ design: s.design });
        expect(
            connectFromHandles(store, { source: s.users, target: null })
        ).toBeUndefined();
        expect(
            connectFromHandles(store, {
                source: s.users,
                target: s.orders,
                sourceHandle: handleId(s.userKey, 'r'),
                targetHandle: null,
            })
        ).toBeUndefined();
        expect(store.getState().design.links.order).toHaveLength(1);
    });

    it('EDT-157: a view refuses to take part', () => {
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
        const store = createEditorStore({ design: asView });
        const col = asView.entities.byId[s.items].columnIds[0];
        expect(
            connectColumns(
                store,
                { entityId: s.users, columnId: s.userKey },
                { entityId: s.items, columnId: col }
            ).kind
        ).toBe('refused');
    });

    it('EDT-153: handles round-trip a column and a side; a field cannot join itself', () => {
        expect(parseHandle(handleId('abc', 'l'))).toEqual({
            columnId: 'abc',
            side: 'l',
        });
        expect(parseHandle('nonsense')).toBeUndefined();
        const same = {
            source: 't',
            target: 't',
            sourceHandle: handleId('c', 'l'),
            targetHandle: handleId('c', 'r'),
        };
        expect(isUsableConnection(same)).toBe(false);
        expect(
            isUsableConnection({ ...same, targetHandle: handleId('d', 'r') })
        ).toBe(true);
    });
});

describe('creating a link table to table', () => {
    it('EDT-159: the card pre-selects the first compatible field of the target', () => {
        const s = shop();
        const found = suggestTarget(s.design, s.users, s.orders);
        expect(found?.sourceColumnId).toBe(s.userKey);
        expect(found?.choice).toEqual({
            kind: 'existing',
            columnId: s.design.entities.byId[s.orders].columnIds[0],
        });
    });

    it('EDT-159: with no compatible field a new field name is suggested from the source table and key', () => {
        const s = shop();
        const found = suggestTarget(
            {
                ...s.design,
                columns: {
                    ...s.design.columns,
                    [s.design.entities.byId[s.items].columnIds[0]]: {
                        ...s.design.columns[
                            s.design.entities.byId[s.items].columnIds[0]
                        ],
                        type: { id: 'text', name: 'text' },
                    },
                },
            },
            s.users,
            s.items
        );
        expect(found?.choice).toEqual({ kind: 'new', name: 'users_id' });
    });

    it('EDT-160, EDT-161: confirming a new name adds the field and the link in one undo step and selects the line', () => {
        const s = shop();
        const store = createEditorStore({ design: s.design });
        const plan = commitQuickLink(store, s.users, s.items, {
            kind: 'new',
            name: 'owner_id',
        });
        expect(plan.ok).toBe(true);
        const state = store.getState();
        const items = state.design.entities.byId[s.items];
        expect(items.columnIds).toHaveLength(2);
        const added = state.design.columns[items.columnIds[1]];
        expect(added.name).toBe('owner_id');
        expect(added.nullable).toBe(true);
        expect(added.type.id).toBe('bigint');
        expect(state.design.links.order).toHaveLength(2);
        expect(state.ui.selection).toEqual([plan.ok ? plan.linkId : '']);
        expect(state.history.undo).toHaveLength(1);
        state.undo();
        expect(store.getState().design.links.order).toHaveLength(1);
        expect(
            store.getState().design.entities.byId[s.items].columnIds
        ).toHaveLength(1);
    });

    it('EDT-161: the failures the card shows inline', () => {
        const s = shop();
        const noKey = {
            ...s.design,
            columns: {
                ...s.design.columns,
                [s.userKey]: {
                    ...s.design.columns[s.userKey],
                    primaryKey: false,
                },
            },
        };
        expect(
            planQuickLink(noKey, s.users, s.items, { kind: 'new', name: 'x' })
        ).toEqual({
            ok: false,
            error: 'no-key',
        });
        expect(
            planQuickLink(s.design, s.users, s.items, {
                kind: 'new',
                name: '  ',
            })
        ).toEqual({
            ok: false,
            error: 'no-field',
        });
    });

    it('EDT-160: a serial key makes a plain integer field on the other table', () => {
        const s = shop();
        const serial = {
            ...s.design,
            columns: {
                ...s.design.columns,
                [s.userKey]: {
                    ...s.design.columns[s.userKey],
                    type: { id: 'bigserial', name: 'bigserial' },
                },
            },
        };
        const plan = planQuickLink(serial, s.users, s.items, {
            kind: 'new',
            name: 'u',
        });
        expect(plan.ok).toBe(true);
        const store = createEditorStore({ design: serial });
        commitQuickLink(store, s.users, s.items, { kind: 'new', name: 'u' });
        const cols = store.getState().design.entities.byId[s.items].columnIds;
        expect(store.getState().design.columns[cols[1]].type.id).toBe('bigint');
    });
});

describe('how a link is drawn', () => {
    it('EDT-171: the line leaves the edges that face each other', () => {
        expect(
            chooseSides({ x: 0, width: 224 }, { x: 300, width: 224 }, false)
        ).toEqual(['r', 'l']);
        expect(
            chooseSides({ x: 300, width: 224 }, { x: 0, width: 224 }, false)
        ).toEqual(['l', 'r']);
    });

    it('EDT-172: a self link loops out of one side and parallel lines are offset', () => {
        expect(
            chooseSides({ x: 0, width: 224 }, { x: 0, width: 224 }, true)
        ).toEqual(['r', 'r']);
        const s = shop();
        const second = {
            ...s.design.links.byId[s.link],
            id: 'second',
        };
        const self = {
            ...second,
            id: 'loop',
            targetEntityId: s.users,
            sourceEntityId: s.users,
        };
        const design = {
            ...s.design,
            links: {
                byId: { ...s.design.links.byId, second, loop: self },
                order: [...s.design.links.order, 'second', 'loop'],
            },
        };
        const edges = buildEdges({ ...edgeInput(s), design });
        const [first, parallel, loop] = edges;
        expect(first.data!.reach).toBeLessThan(parallel.data!.reach);
        expect(loop.data!.selfLoop).toBe(true);
        expect(loop.sourceHandle?.endsWith(':r')).toBe(true);
        expect(loop.targetHandle?.endsWith(':r')).toBe(true);
    });

    it('EDT-173: ends carry a bar for one and a foot for many; the preference hides them', async () => {
        const s = shop();
        const asMany = {
            ...s.design,
            links: {
                ...s.design.links,
                byId: {
                    ...s.design.links.byId,
                    [s.link]: {
                        ...s.design.links.byId[s.link],
                        targetCardinality: 'many' as const,
                    },
                },
            },
        };
        const shown = renderCanvas(asMany);
        await waitFor(() =>
            expect(
                shown.container.querySelectorAll('[data-marker]')
            ).toHaveLength(2)
        );
        const ends = [...shown.container.querySelectorAll('[data-marker]')];
        expect(ends.map((g) => g.textContent).sort()).toEqual(['1', 'N']);
        shown.unmount();

        const hidden = renderCanvas(asMany, {
            canvas: { prefs: { showCardinality: false } },
        });
        const bare = await waitFor(() => {
            const found = hidden.container.querySelector(
                '.react-flow__edge-path'
            );
            expect(found).not.toBeNull();
            return found!;
        });
        expect(hidden.container.querySelector('[data-marker]')).toBeNull();
        expect(bare).not.toBeNull();
    });

    it('EDT-026, EDT-174: a selected line takes the picked colour and shows a dot to open the popover', async () => {
        const s = shop();
        const { store, container } = renderCanvas(s.design);
        await waitFor(() =>
            expect(container.querySelector('.react-flow__edge')).not.toBeNull()
        );
        expect(screen.queryByTestId(`link-dot-${s.link}`)).toBeNull();
        act(() => store.getState().select([s.link]));
        expect(
            await screen.findByTestId(`link-dot-${s.link}`)
        ).toBeInTheDocument();
        const path = container.querySelector('.react-flow__edge-path')!;
        expect(path.getAttribute('style')).toContain(
            'oklch(0.6 0.118 184.704)'
        );
        expect(path.getAttribute('style')).toContain('stroke-dasharray');
    });
});

describe('the line popover', () => {
    const openPopover = async (hooks: object = {}) => {
        const s = shop();
        const view = renderCanvas(s.design, { canvas: { hooks } });
        act(() => view.store.getState().select([s.link]));
        fireEvent.click(await screen.findByTestId(`link-dot-${s.link}`));
        return { s, ...view, box: screen.getByRole('dialog') };
    };

    it('EDT-175: the popover offers 1:1, 1:N, switch tables, open in sidebar and delete', async () => {
        const { box } = await openPopover();
        expect(within(box).getByText('1:1')).toHaveAttribute(
            'aria-pressed',
            'true'
        );
        expect(within(box).getByText('1:N')).toHaveAttribute(
            'aria-pressed',
            'false'
        );
        for (const name of [
            'Switch tables',
            'Open in side panel',
            'Delete relationship',
        ])
            expect(within(box).getByLabelText(name)).toBeInTheDocument();
    });

    it('EDT-175: Escape and a click elsewhere close it', async () => {
        const first = await openPopover();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
        first.unmount();
        await openPopover();
        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('EDT-170, EDT-176: 1:N keeps the ends; the many side is always the target', async () => {
        const { s, store, box } = await openPopover();
        fireEvent.click(within(box).getByText('1:N'));
        const link = store.getState().design.links.byId[s.link];
        expect([link.sourceCardinality, link.targetCardinality]).toEqual([
            'one',
            'many',
        ]);
        expect(link.targetEntityId).toBe(s.orders);
    });

    it('EDT-177: Switch tables swaps source and target and is undoable', async () => {
        const { s, store, box } = await openPopover();
        fireEvent.click(within(box).getByLabelText('Switch tables'));
        const link = store.getState().design.links.byId[s.link];
        expect(link.sourceEntityId).toBe(s.orders);
        expect(link.targetEntityId).toBe(s.users);
        act(() => void store.getState().undo());
        expect(store.getState().design.links.byId[s.link].sourceEntityId).toBe(
            s.users
        );
    });

    it('EDT-175: Open in side panel shows the Refs section and tells the workspace', async () => {
        const showLinkInPanel = vi.fn();
        const { s, store, box } = await openPopover({ showLinkInPanel });
        fireEvent.click(within(box).getByLabelText('Open in side panel'));
        expect(store.getState().ui.panel.section).toBe('refs');
        expect(showLinkInPanel).toHaveBeenCalledWith(s.link);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('EDT-181: Delete relationship removes only the line, as one undo step', async () => {
        const { s, store, box } = await openPopover();
        fireEvent.click(within(box).getByLabelText('Delete relationship'));
        expect(store.getState().design.links.order).toHaveLength(0);
        expect(Object.keys(store.getState().design.columns)).toContain(
            s.orderUser
        );
        act(() => void store.getState().undo());
        expect(store.getState().design.links.order).toEqual([s.link]);
    });

    it('EDT-181: Delete on a selected line removes it', async () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        act(() => store.getState().select([s.link]));
        fireEvent.keyDown(document.body, { key: 'Delete' });
        expect(store.getState().design.links.order).toHaveLength(0);
    });

    it('EDT-175: a double click on the line opens the popover', async () => {
        const s = shop();
        const { container } = renderCanvas(s.design);
        const edge = await waitFor(() => {
            const found = container.querySelector('.react-flow__edge');
            expect(found).not.toBeNull();
            return found!;
        });
        fireEvent.doubleClick(edge);
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });
});

/** The DOM of a table with one field row, as the canvas draws it: `inner` is the middle of the row. */
function tableWithRow(entityId: string, columnId: string) {
    const node = document.createElement('div');
    node.className = 'react-flow__node-entity';
    node.setAttribute('data-id', entityId);
    const row = document.createElement('div');
    row.setAttribute('data-testid', `field-${columnId}`);
    const inner = document.createElement('span');
    row.append(inner);
    const header = document.createElement('div');
    node.append(header, row);
    return { node, row, inner, header };
}

describe('releasing a link drag on the row of a field, away from its dots', () => {
    const setup = () => {
        const s = shop();
        const store = createEditorStore({ design: s.design });
        const items = s.design.entities.byId[s.items].columnIds[0];
        // items.id and the orders field are compatible whole numbers
        const from = { nodeId: s.orders, handleId: handleId(s.orderUser, 'r') };
        return { s, store, items, from };
    };

    it('joins the two fields, the same as a release on a dot', () => {
        const { s, store, items, from } = setup();
        const { inner } = tableWithRow(s.items, items);
        const viaRow = connectFromDrop(store, from, inner);

        const dot = createEditorStore({ design: s.design });
        const viaDot = connectFromHandles(dot, {
            source: from.nodeId,
            sourceHandle: from.handleId,
            target: s.items,
            targetHandle: handleId(items, 'l'),
        });

        expect(viaRow?.kind).toBe('created');
        expect(viaRow?.kind).toBe(viaDot?.kind);
        const links = store.getState().design.links;
        expect(links.order).toHaveLength(2);
        const made = links.byId[links.order[1]];
        const sameLink = dot.getState().design.links;
        const other = sameLink.byId[sameLink.order[1]];
        expect(made).toMatchObject({
            sourceEntityId: s.orders,
            sourceColumnId: s.orderUser,
            targetEntityId: s.items,
            targetColumnId: items,
            name: other.name,
        });
    });

    it('works on the row itself and whichever side the drag began on', () => {
        const { s, store, items } = setup();
        const { row } = tableWithRow(s.items, items);
        const out = connectFromDrop(
            store,
            { nodeId: s.orders, handleId: handleId(s.orderUser, 'l') },
            row
        );
        expect(out?.kind).toBe('created');
    });

    it('a pair that is already joined says so and adds nothing', () => {
        const { s, store, from } = setup();
        const { inner } = tableWithRow(s.users, s.userKey);
        const out = connectFromDrop(store, from, inner);
        expect(out).toEqual({ kind: 'exists', linkId: s.link });
        expect(store.getState().design.links.order).toHaveLength(1);
    });

    it('a release on the table header, empty canvas or nothing creates nothing', () => {
        const { s, store, items, from } = setup();
        const { header } = tableWithRow(s.items, items);
        expect(connectFromDrop(store, from, header)).toBeUndefined();
        expect(connectFromDrop(store, from, document.body)).toBeUndefined();
        expect(connectFromDrop(store, from, null)).toBeUndefined();
        expect(connectFromDrop(store, from, undefined)).toBeUndefined();
        expect(store.getState().design.links.order).toHaveLength(1);
    });

    it('a field cannot be joined to itself', () => {
        const { s, store, from } = setup();
        const { inner } = tableWithRow(s.orders, s.orderUser);
        expect(connectFromDrop(store, from, inner)).toBeUndefined();
        expect(store.getState().design.links.order).toHaveLength(1);
    });

    it('a row that is not a field of that table is ignored', () => {
        const { s, store, items, from } = setup();
        // the id of a field of another table, and an id no table has
        expect(
            connectFromDrop(store, from, tableWithRow(s.items, s.userKey).inner)
        ).toBeUndefined();
        expect(
            connectFromDrop(store, from, tableWithRow(s.items, 'nope').inner)
        ).toBeUndefined();
        expect(items).toBeTruthy();
        expect(store.getState().design.links.order).toHaveLength(1);
    });

    it('a read-only editor creates nothing', () => {
        const { s, store, items, from } = setup();
        store.getState().setReadonly(true);
        const { inner } = tableWithRow(s.items, items);
        expect(connectFromDrop(store, from, inner)?.kind).not.toBe('created');
        expect(store.getState().design.links.order).toHaveLength(1);
    });
});
