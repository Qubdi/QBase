import { describe, expect, it } from 'vitest';
import { apply } from '@/core/commands/apply';
import { planAddColumn } from '@/core/commands/plan-column';
import { planLink } from '@/core/commands/plan-link';
import { blank, NOW, rng } from '@/core/testing/helpers';
import { createEditorStore } from '@/store/editor-store';
import {
    activeFocus,
    buildEdges,
    buildNodes,
    dimmedEntities,
    NO_LIVE,
} from './flow-model';
import type { FlowInput } from './flow-model';
import { shop } from './test/fixtures';

/**
 * orders has two links on two different fields: orders.user_id -> users.id and
 * orders.id -> items.id. `note` is a field of orders with no link at all.
 */
function twoLinks() {
    const s = shop();
    const random = rng(11);
    const ordersId = s.design.entities.byId[s.orders].columnIds[0];
    const itemsId = s.design.entities.byId[s.items].columnIds[0];
    const plan = planLink(
        s.design,
        { entityId: s.orders, columnId: ordersId },
        { entityId: s.items, columnId: itemsId },
        { now: NOW, random }
    );
    if (plan.kind !== 'ok') throw new Error('no link');
    const design = apply(s.design, plan.command, { now: NOW });
    if (!design.ok) throw new Error(design.message);
    const note = planAddColumn(design.design, s.orders, {
        name: 'note',
        type: { id: 'text', name: 'text' },
        now: NOW,
        random,
    });
    if (!note || note.type !== 'part.insert') throw new Error('no column');
    const done = apply(design.design, note, { now: NOW });
    if (!done.ok) throw new Error(done.message);
    return {
        ...s,
        design: done.design,
        ordersId,
        itemsId,
        note: note.item.id,
        toUsers: s.link,
        toItems: plan.link.id,
    };
}

const flow = (
    t: ReturnType<typeof twoLinks>,
    pick: string[],
    focusColumn?: FlowInput['focusColumn']
): FlowInput => ({
    design: t.design,
    selection: new Set(pick),
    focusColumn,
    visible: new Set(t.design.entities.order),
    live: NO_LIVE,
    flashing: new Set<string>(),
    overlapping: new Set<string>(),
    sizes: {},
    outlineOverlaps: false,
    editable: true,
});

describe('clicking a field follows only that field', () => {
    it('a table click is as it was: every table joined to it stays bright', () => {
        const t = twoLinks();
        expect(dimmedEntities(t.design, new Set([t.orders])).size).toBe(0);
    });

    it('a field keeps only the tables joined to that field', () => {
        const t = twoLinks();
        const pick = new Set([t.orders]);
        const dim = (columnId: string) =>
            dimmedEntities(t.design, pick, { entityId: t.orders, columnId });
        expect([...dim(t.orderUser)]).toEqual([t.items]);
        expect([...dim(t.ordersId)]).toEqual([t.users]);
    });

    it('a field with no link leaves only its own table bright', () => {
        const t = twoLinks();
        const dim = dimmedEntities(t.design, new Set([t.orders]), {
            entityId: t.orders,
            columnId: t.note,
        });
        expect([...dim].sort()).toEqual([t.users, t.items].sort());
    });

    it('works from the other end of a link too', () => {
        const t = twoLinks();
        const dim = dimmedEntities(t.design, new Set([t.users]), {
            entityId: t.users,
            columnId: t.userKey,
        });
        // users.id is joined to orders only
        expect([...dim]).toEqual([t.items]);
    });

    it('counts only while that table is the one thing selected and the field is in it', () => {
        const t = twoLinks();
        const focus = { entityId: t.orders, columnId: t.orderUser };
        expect(activeFocus(t.design, new Set([t.orders]), focus)).toEqual(
            focus
        );
        expect(activeFocus(t.design, new Set(), focus)).toBeUndefined();
        expect(
            activeFocus(t.design, new Set([t.users]), focus)
        ).toBeUndefined();
        expect(
            activeFocus(t.design, new Set([t.orders, t.users]), focus)
        ).toBeUndefined();
        expect(
            activeFocus(t.design, new Set([t.orders]), {
                entityId: t.orders,
                columnId: t.userKey,
            })
        ).toBeUndefined();
        expect(
            dimmedEntities(t.design, new Set([t.orders, t.users]), focus).size
        ).toBe(dimmedEntities(t.design, new Set([t.orders, t.users])).size);
    });

    it('draws the dimmed tables on the nodes', () => {
        const t = twoLinks();
        const nodes = buildNodes(
            flow(t, [t.orders], {
                entityId: t.orders,
                columnId: t.orderUser,
            })
        );
        const dimmed = (id: string) =>
            (nodes.find((n) => n.id === id)?.data as { dimmed: boolean })
                .dimmed;
        expect(dimmed(t.orders)).toBe(false);
        expect(dimmed(t.users)).toBe(false);
        expect(dimmed(t.items)).toBe(true);
    });

    it('only the lines at that field stay bright', () => {
        const t = twoLinks();
        const dimmed = (focusId?: string) => {
            const edges = buildEdges(
                flow(
                    t,
                    [t.orders],
                    focusId
                        ? { entityId: t.orders, columnId: focusId }
                        : undefined
                )
            );
            return Object.fromEntries(edges.map((e) => [e.id, e.data?.dimmed]));
        };
        // a table click: both lines touch the bright set
        expect(dimmed()).toEqual({ [t.toUsers]: false, [t.toItems]: false });
        expect(dimmed(t.orderUser)).toEqual({
            [t.toUsers]: false,
            [t.toItems]: true,
        });
        expect(dimmed(t.ordersId)).toEqual({
            [t.toUsers]: true,
            [t.toItems]: false,
        });
        expect(dimmed(t.note)).toEqual({
            [t.toUsers]: true,
            [t.toItems]: true,
        });
    });

    it('a line between two bright tables on another field fades', () => {
        // users.id is joined to orders.user_id; orders.id to items.id. Add a
        // second line users -> orders on another field pair: it joins two
        // tables that are both bright, yet it is not at the focused field.
        const t = twoLinks();
        const random = rng(21);
        const extra = planAddColumn(t.design, t.users, {
            name: 'last_order',
            now: NOW,
            random,
        });
        if (!extra || extra.type !== 'part.insert')
            throw new Error('no column');
        const withColumn = apply(t.design, extra, { now: NOW });
        if (!withColumn.ok) throw new Error(withColumn.message);
        const plan = planLink(
            withColumn.design,
            { entityId: t.users, columnId: extra.item.id },
            { entityId: t.orders, columnId: t.ordersId },
            { now: NOW, random }
        );
        if (plan.kind !== 'ok') throw new Error('no link');
        const done = apply(withColumn.design, plan.command, { now: NOW });
        if (!done.ok) throw new Error(done.message);
        const design = done.design;
        const edges = buildEdges({
            ...flow({ ...t, design }, [t.orders], {
                entityId: t.orders,
                columnId: t.orderUser,
            }),
            design,
        });
        const by = Object.fromEntries(edges.map((e) => [e.id, e.data?.dimmed]));
        expect(by[t.toUsers]).toBe(false);
        expect(by[plan.link.id]).toBe(true);
    });
});

describe('the focused field in the editor store', () => {
    const open = () => {
        const t = twoLinks();
        const store = createEditorStore({ design: t.design });
        return { t, store };
    };

    it('stays while only its table is selected', () => {
        const { t, store } = open();
        store.getState().select([t.orders]);
        store
            .getState()
            .setFocusColumn({ entityId: t.orders, columnId: t.orderUser });
        store.getState().select([t.orders]);
        expect(store.getState().ui.focusColumn).toEqual({
            entityId: t.orders,
            columnId: t.orderUser,
        });
    });

    it('goes when another table, several things or nothing is selected', () => {
        const { t, store } = open();
        const focus = { entityId: t.orders, columnId: t.orderUser };
        for (const next of [[t.users], [t.orders, t.users], []]) {
            store.getState().select([t.orders]);
            store.getState().setFocusColumn(focus);
            store.getState().select(next);
            expect(store.getState().ui.focusColumn).toBeUndefined();
        }
    });

    it('goes when another design is opened', () => {
        const { t, store } = open();
        store.getState().select([t.orders]);
        store
            .getState()
            .setFocusColumn({ entityId: t.orders, columnId: t.orderUser });
        store.getState().replaceDesign(blank(), { history: 'reset' });
        expect(store.getState().ui.focusColumn).toBeUndefined();
    });

    it('setting the same field again changes nothing', () => {
        const { t, store } = open();
        const focus = { entityId: t.orders, columnId: t.orderUser };
        store.getState().setFocusColumn(focus);
        const before = store.getState().ui;
        store.getState().setFocusColumn({ ...focus });
        expect(store.getState().ui).toBe(before);
    });

    it('is not saved with the design and does not make it unsaved', () => {
        const { t, store } = open();
        const design = store.getState().design;
        store.getState().select([t.orders]);
        store
            .getState()
            .setFocusColumn({ entityId: t.orders, columnId: t.orderUser });
        expect(store.getState().design).toBe(design);
        expect(store.getState().session.dirty).toBe(false);
    });
});
